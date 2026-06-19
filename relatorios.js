/* ════════════════════════════════════════════════════════════════
   relatorios.js — Relatório Pedagógico + Comparar Turmas
   A.V. Leitura+ — Sistema de Habilidades
════════════════════════════════════════════════════════════════ */

/* Instâncias de gráficos do relatório */
var relLineNew = null;
var relBarNew  = null;
var compMediaChart      = null;
var compEvolucaoChart   = null;
var compHabilidadesChart = null;

/* Helper: destrói chart com segurança */
function _destroyChart(inst) {
    if (!inst) return null;
    try { inst.destroy(); } catch(e) {}
    return null;
}

/* Helper: aplica devicePixelRatio para nitidez em telas Retina */
function _sharpCanvas(canvasId) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.parentElement ? canvas.parentElement.getBoundingClientRect() : { width: canvas.offsetWidth, height: canvas.offsetHeight };
    var w = rect.width  || 400;
    var h = rect.height || 300;
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width  = w + "px";
    canvas.style.height = h + "px";
    var ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    return canvas;
}

/* ════════════════════════════════════════════════════════════════
   RELATÓRIO PEDAGÓGICO
════════════════════════════════════════════════════════════════ */
function abrirRelatorioModal() {
    var atual  = getPeriodo();
    var alunos = getAlunos();
    var turma  = getTurmaAtual();

    document.getElementById("rel-periodo-titulo").innerText = selP.options[selP.selectedIndex].text;
    document.getElementById("rel-total-new").innerText      = alunos.length;
    document.getElementById("rel-turma").innerText          = turma.toUpperCase();

    /* Ano letivo: lê do ano selecionado globalmente (mesmo do filtro da sidebar) */
    var anoSel = (typeof alGetAnoSelecionado === "function") ? alGetAnoSelecionado() : null;
    var anoTxt = anoSel ? anoSel.ano : (typeof getAnoLetivoAtivo === "function" && getAnoLetivoAtivo() ? getAnoLetivoAtivo().ano : "");
    var elAno  = document.getElementById("rel-ano-letivo");
    if (elAno) elAno.innerText = anoTxt ? "Ano letivo " + anoTxt : "Ano letivo";

    var html = "";
    var contNiveis = {
        "Leitor fluente": 0, "Leitor avançado": 0, "Leitor iniciante": 0,
        "Pré-leitor 2": 0,  "Pré-leitor 1": 0
    };
    var lista = [], somaTotal = 0;

    alunos.forEach(function(nome) {
        var s  = calcularSomaAluno(turma, atual, nome);
        somaTotal += s;
        var nv = calcularNivel(s);
        contNiveis[nv.txt]++;
        lista.push({ n: nome, s: s, nv: nv });
    });

    document.getElementById("rel-media-new").innerText =
        (alunos.length ? (somaTotal / alunos.length).toFixed(1) : "0,0").replace(".", ",");
    document.getElementById("rel-nivel-new").innerText =
        Object.keys(contNiveis).reduce(function(a, b) { return contNiveis[a] > contNiveis[b] ? a : b; }) || "-";

    lista.sort(function(a, b) { return b.s - a.s; }).forEach(function(item) {
        var atvsRec = gerarAtividadesRecomendadas(turma, atual, item.n, item.s);
        var atvHtml;
        if (atvsRec.length > 0) {
            atvHtml = '<ul class="atv-rec-list">' + atvsRec.map(function(a) {
                return '<li class="atv-rec-item' + (a.tipo === "vinculada" ? " vinculada" : "") + '">' + a.nome + '</li>';
            }).join("") + '</ul>';
        } else {
            atvHtml = '<span class="atv-rec-vazia">Nenhuma atividade</span>';
        }

        var _nEsc = item.n.replace(/"/g, "&quot;");
        var _lvl  = calcularNivel(item.s).txt.replace(/"/g, "&quot;");

        html += '<tr class="tr-compact">'
             + '<td class="td-nome" style="font-size:12px;text-align:left;">' + item.n + '</td>'
             + '<td style="text-align:center;font-weight:bold;">' + item.s + '</td>'
             + '<td style="text-align:center;"><span class="badge-nivel ' + item.nv.cls + '">' + item.nv.txt + '</span></td>'
             + '<td class="txt-rec">' + getTextoRecomendacao(item.s) + '</td>'
             + '<td style="text-align:right;padding:3px 12px 3px 4px;vertical-align:middle;">'
             + '<button class="btn-ver-atividades" data-nome="' + _nEsc + '" data-nivel="' + _lvl + '" onclick="irParaAtvBtn(this)">'
             + '<i class="fas fa-book-open"></i> Ver atividades</button></td>'
             + '</tr>';
    });

    document.getElementById("rel-tabela-body").innerHTML = html;
    setTimeout(function() { gerarGraficosNovos(contNiveis); }, 200);
}

function gerarGraficosNovos(contNiveis) {
    var coresNiveis  = ["#2563eb", "#16a34a", "#facc15", "#fb923c", "#ef4444"];
    var labelsNiveis = ["Leitor fluente", "Leitor avançado", "Leitor iniciante", "Pré-leitor 2", "Pré-leitor 1"];
    var turma = getTurmaAtual();
    var labelsEvol = [], dadosEvol = [];

    periodosArr.forEach(function(p) {
        var als = getAlunos(p.v);
        if (als.length > 0) {
            labelsEvol.push(p.t === "DIAGNÓSTICO" ? "Diag." : p.t.split(" ")[0]);
            var sp = 0;
            als.forEach(function(n) { sp += calcularSomaAluno(turma, p.v, n); });
            dadosEvol.push((sp / als.length).toFixed(1));
        }
    });

    if (relLineNew) relLineNew.destroy();
    mostrarLoadingLocal("rel-chart-line-new");
    relLineNew = new Chart(document.getElementById("rel-chart-line-new"), {
        type: "line",
        data: {
            labels: labelsEvol,
            datasets: [{
                data: dadosEvol,
                borderColor: "#3b82f6",
                backgroundColor: "rgba(59,130,246,0.08)",
                borderWidth: 2.5,
                pointRadius: 6,
                pointBackgroundColor: "#3b82f6",
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            animation: { duration: 500 },
            scales: {
                y: { beginAtZero: true, max: 14, ticks: { stepSize: 2, font: { size: 9 } } },
                x: { ticks: { font: { size: 9 } } }
            },
            plugins: {
                legend: { display: false },
                datalabels: { anchor: "end", align: "top", formatter: function(v) { return v; }, font: { weight: "bold", size: 12 }, color: "#1e293b", offset: 2 }
            }
        }
    });

    var total = Object.values(contNiveis).reduce(function(a, b) { return a + b; }, 0);
    var pcts  = labelsNiveis.map(function(l) { return total > 0 ? parseFloat(((contNiveis[l] || 0) / total * 100).toFixed(1)) : 0; });

    if (relBarNew) relBarNew.destroy();
    mostrarLoadingLocal("rel-chart-bar-new");
    relBarNew = new Chart(document.getElementById("rel-chart-bar-new"), {
        type: "bar",
        data: {
            labels: labelsNiveis,
            datasets: [{ data: pcts, backgroundColor: coresNiveis, borderRadius: 6, barPercentage: 0.8, categoryPercentage: 0.9 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            animation: { duration: 500 },
            scales: {
                y: { beginAtZero: true, max: 100, ticks: { callback: function(v) { return v + "%"; }, font: { size: 9 } } },
                x: { ticks: { font: { size: 9 }, maxRotation: 45 } }
            },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: function(ctx) { return " " + ctx.parsed.y + "% da turma"; } } },
                datalabels: {
                    anchor: "center", align: "center", color: "#000",
                    formatter: function(v) { return v + "%"; },
                    font: { weight: "bold", size: 13 }
                }
            }
        }
    });
    ocultarLoadingLocal("rel-chart-line-new");
    ocultarLoadingLocal("rel-chart-bar-new");
}

/* ════════════════════════════════════════════════════════════════
   ATIVIDADES RECOMENDADAS NO RELATÓRIO
════════════════════════════════════════════════════════════════ */
function gerarAtividadesRecomendadas(turma, periodo, nome, somaAluno) {
    var nivel    = calcularNivel(somaAluno).txt;
    var proxHab  = [];

    for (var i = 0; i < 7; i++) {
        var v = getNotaHabilidade(turma, periodo, nome, i);
        if (v === "1") proxHab.push(colNames[i]);
        else if (v === "2" && i + 1 < 7) proxHab.push(colNames[i + 1]);
    }
    var habsAlvo     = [...new Set(proxHab)].slice(0, 3);
    var recomendadas = [];
    var seen         = new Set();

    /* 1. Atividades vinculadas diretamente ao aluno */
    atvDados.forEach(function(a) {
        if (a.alunos && a.alunos.includes(nome) && !seen.has(a.id)) {
            recomendadas.push({ nome: a.nome, tipo: "vinculada" });
            seen.add(a.id);
        }
    });
    /* 2. Atividades por habilidade alvo */
    habsAlvo.forEach(function(hab) {
        atvDados.forEach(function(a) {
            if (!seen.has(a.id) && a.hab === hab) {
                recomendadas.push({ nome: a.nome, tipo: "hab" });
                seen.add(a.id);
            }
        });
    });
    /* 3. Atividades por nível se ainda sem recomendações */
    if (recomendadas.length === 0) {
        atvDados.forEach(function(a) {
            if (!seen.has(a.id) && a.nivel === nivel) {
                recomendadas.push({ nome: a.nome, tipo: "nivel" });
                seen.add(a.id);
            }
        });
    }
    return recomendadas.slice(0, 3);
}

/* Redireciona para aba Atividades já filtrada */
function irParaAtvBtn(btn) {
    irParaAtividades(btn.getAttribute("data-nome"), btn.getAttribute("data-nivel"));
}

function irParaAtividades(nomeAluno, nivelAluno) {
    document.querySelectorAll(".content-body").forEach(function(el) { el.classList.remove("active"); });
    document.querySelectorAll(".nav-item").forEach(function(el) { el.classList.remove("active"); });
    document.getElementById("aba-atividades").classList.add("active");
    var btnAtv = document.querySelector("[onclick*=\"atividades\"]");
    if (btnAtv) btnAtv.classList.add("active");
    atualizarBotoesHeader("atividades");

    setTimeout(function() {
        var fNivel = document.getElementById("atv-f-nivel");
        var fBusca = document.getElementById("atv-busca");
        if (fNivel) fNivel.value = nivelAluno;
        if (fBusca) fBusca.value = "";
        atvFiltrar();

        /* Badge temporário de contexto */
        var stats = document.getElementById("atv-stats-row");
        if (stats) {
            var badge = document.createElement("div");
            badge.className = "atv-stat-chip";
            badge.style.cssText = "background:rgba(76,110,245,0.12);border-color:rgba(76,110,245,0.3);color:var(--cor-primaria);font-weight:700;";
            badge.innerHTML = "<i class=\"fas fa-user\" style=\"font-size:9px;\"></i> Aluno: " + nomeAluno;
            stats.insertBefore(badge, stats.firstChild);
            setTimeout(function() { badge.remove(); }, 5000);
        }
    }, 80);
}

/* ════════════════════════════════════════════════════════════════
   COMPARAR TURMAS
════════════════════════════════════════════════════════════════ */
function popularCheckboxesTurmas() {
    var container = document.getElementById("turmasCheckboxes");
    if (!container) return;
    var turmas  = obterTodasTurmasComDados();
    var storage = getTurmasStorage();
    if (turmas.length === 0) {
        container.innerHTML = "<div style='font-size:12px;color:var(--texto-desabilitado);padding:8px 0;'>Nenhuma turma disponível.</div>";
        return;
    }
    container.innerHTML = turmas.map(function(t) {
        var nome  = normalizarTurma(t); /* só trim — preserva aspas e letras */
        var turno = "";
        for (var i = 0; i < storage.length; i++) {
            var s = storage[i];
            if (typeof s === "object" && normalizarTurma(s.nome) === nome) { turno = s.turno || ""; break; }
        }
        var label = '<span style="font-weight:600;font-size:12px;">' + nome.toUpperCase() + '</span>'
                  + (turno ? '<br><span style="font-size:10px;color:var(--texto-desabilitado);font-weight:400;">' + turno + '</span>' : '');
        /* Usa data-nome para evitar quebra do HTML com aspas no nome */
        return '<label style="display:flex;align-items:flex-start;gap:6px;line-height:1.3;">'
             + '<input type="checkbox" data-nome="' + nome.replace(/"/g, '&quot;') + '" checked onchange="atualizarComparacao()" style="margin-top:3px;">'
             + '<span>' + label + '</span></label>';
    }).join("");
}

function preencherPeriodosComparar() {
    var sel = document.getElementById("periodoComparar");
    if (!sel) return;
    /* Garante que as opções de períodos existem (o HTML já tem "TODOS") */
    if (sel.querySelector("option[value='DIAG']")) return; /* já populado */
    /* Limpa e reconstrói preservando seleção atual */
    var valorAtual = sel.value || "TODOS";
    sel.innerHTML = "";
    var oTodos = document.createElement("option");
    oTodos.value = "TODOS"; oTodos.text = "Todos os períodos";
    sel.appendChild(oTodos);
    periodosArr.forEach(function(p) {
        var o = document.createElement("option");
        o.value = p.v; o.text = p.t;
        sel.appendChild(o);
    });
    sel.value = valorAtual;
}

/* Retorna períodos com dados reais para uma turma */
function _periodosComDados(turma) {
    return periodosArr.filter(function(p) {
        var als = JSON.parse(localStorage.getItem(chaveAlunos(turma, p.v))) || [];
        return als.length > 0;
    });
}

/* Calcula média de uma turma num período ou no último período com dados */
function _mediaTurma(turma, periodo) {
    if (periodo !== "TODOS") return calcularMediaTurmaPeriodoComparar(turma, periodo);
    /* "Todos os períodos" → usar o último período que possui dados reais */
    var periodos = _periodosComDados(turma);
    if (!periodos.length) return 0;
    return calcularMediaTurmaPeriodoComparar(turma, periodos[periodos.length - 1].v);
}

/* Retorna lista de alunos para turma/período (ou união de todos os períodos) */
function _alunosTurma(turma, periodo) {
    if (periodo !== "TODOS") {
        return JSON.parse(localStorage.getItem(chaveAlunos(turma, periodo))) || [];
    }
    /* União de todos os períodos com dados */
    var set = {};
    _periodosComDados(turma).forEach(function(p) {
        (JSON.parse(localStorage.getItem(chaveAlunos(turma, p.v))) || []).forEach(function(n) { set[n] = true; });
    });
    return Object.keys(set);
}

/* Melhor soma de um aluno (último período com dados) ou média de todos */
function _somaAluno(turma, periodo, nome) {
    if (periodo !== "TODOS") return calcularSomaAluno(turma, periodo, nome);
    var periodos = _periodosComDados(turma).filter(function(p) {
        return calcularSomaAluno(turma, p.v, nome) > 0;
    });
    if (!periodos.length) return 0;
    /* Retorna o valor do último período com dados */
    return calcularSomaAluno(turma, periodos[periodos.length - 1].v, nome);
}

function obterTodasTurmasComDados() {
    /* Usa getTurmasVisiveis: turmas ocultas são filtradas para roles não autorizados */
    var storage = getTurmasVisiveis();
    if (storage.length > 0) {
        return storage.map(function(t) {
            return normalizarTurma((typeof t === "object") ? t.nome : String(t));
        });
    }
    /* Fallback: select (já populado com turmas visíveis via inicializarTurmas) */
    var sel = document.getElementById("turmaSelect");
    var turmas = [];
    if (sel) {
        for (var i = 0; i < sel.options.length; i++) {
            var v = sel.options[i].value;
            if (v) turmas.push(normalizarTurma(v));
        }
    }
    return turmas;
}

function calcularMediaTurmaPeriodoComparar(turma, periodo) {
    var nomeTurma = normalizarTurma(turma); /* trim apenas, preserva aspas */
    var als = JSON.parse(localStorage.getItem(chaveAlunos(nomeTurma, periodo))) || [];
    if (als.length === 0) return 0;
    return als.reduce(function(soma, nome) {
        return soma + calcularSomaAluno(nomeTurma, periodo, normalizarAluno(nome));
    }, 0) / als.length;
}

var _compSincronizando = false; /* flag anti-race-condition */

function atualizarComparacao() {
    if (_compSincronizando) { console.warn("[Comparar] Aguardando sincronização..."); return; }
    var checks  = document.querySelectorAll("#turmasCheckboxes input[type=\"checkbox\"]:checked");
    /* Lê data-nome — preserva aspas e caracteres especiais do nome da turma */
    var turmas  = Array.from(checks).map(function(cb) {
        return normalizarTurma(cb.getAttribute("data-nome") || cb.value);
    });
    var periodo = normalizarPeriodo(document.getElementById("periodoComparar").value);
    if (!periodo || turmas.length === 0) return;
    renderizarGraficosComparativos(turmas, periodo);
}

function renderizarGraficosComparativos(turmas, periodo) {
    var cores = [
        "#3b82f6","#10b981","#8b5cf6","#f97316","#0ea5e9",
        "#ec4899","#14b8a6","#f59e0b","#6366f1","#84cc16",
        "#ef4444","#06b6d4","#a855f7","#22c55e","#fb923c"
    ];
    var niveisOrdem = ["Leitor fluente","Leitor avançado","Leitor iniciante","Pré-leitor 2","Pré-leitor 1"];
    var coresNiveis = {
        "Leitor fluente":"#2563eb","Leitor avançado":"#16a34a",
        "Leitor iniciante":"#ca8a04","Pré-leitor 2":"#ea580c","Pré-leitor 1":"#dc2626"
    };
    if (!turmas || turmas.length === 0) return;
    turmas = turmas.map(function(t){ return normalizarTurma(t); });

    var todosPeriodos = periodo === "TODOS";

    /* ── Loading local nos containers de gráfico ── */
    mostrarLoadingLocal("chart-media-comparar");
    mostrarLoadingLocal("chart-evolucao-tempo");
    mostrarLoadingLocal("chart-habilidades-comparar");

    /* ── Ajustar Chart.js para o tema atual ── */
    var _isDark = document.documentElement.getAttribute("data-theme") === "dark";
    Chart.defaults.color       = _isDark ? "#8896b3" : "#64748b";
    Chart.defaults.borderColor = _isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";

    /* ── DESTRUIR todos os charts antes de qualquer new Chart() ── */
    compMediaChart      = _destroyChart(compMediaChart);
    compEvolucaoChart   = _destroyChart(compEvolucaoChart);
    compHabilidadesChart = _destroyChart(compHabilidadesChart);

    /* Tooltip premium */
    var tooltipPremium = {
        backgroundColor: "#111827", titleColor: "#fff",
        bodyColor: "#e5e7eb", padding: 12,
        cornerRadius: 10, borderColor: "rgba(255,255,255,0.1)", borderWidth: 1
    };

    /* ════════════════════════════════════════════════════════════
       GRÁFICO 1: Média por turma (barras)
    ════════════════════════════════════════════════════════════ */
    var medias = turmas.map(function(t) {
        return parseFloat(_mediaTurma(t, periodo).toFixed(2));
    });
    var c1 = _sharpCanvas("chart-media-comparar");
    if (c1) {
        compMediaChart = new Chart(c1, {
            type: "bar",
            data: {
                labels: turmas,
                datasets: [{
                    data: medias,
                    backgroundColor: cores.slice(0, turmas.length).map(function(c) { return c + "CC"; }),
                    borderColor:     cores.slice(0, turmas.length),
                    borderWidth: 2, borderRadius: 10, borderSkipped: false, hoverBorderWidth: 3
                }]
            },
            options: {
                responsive: false, maintainAspectRatio: false,
                animation: { duration: 600, easing: "easeOutQuart" },
                layout: { padding: { top: 30 } },
                plugins: {
                    legend: { display: false },
                    tooltip: tooltipPremium,
                    datalabels: {
                        anchor: "end", align: "top", offset: 4,
                        formatter: function(v) { return v.toFixed(1); },
                        font: { weight: "bold", size: 12 }, color: "#1e293b"
                    }
                },
                scales: {
                    y: {
                        min: 0, max: 14,
                        ticks: { stepSize: 1, precision: 0, font: { size: 10 } },
                        grid: { color: "rgba(0,0,0,0.06)" }
                    },
                    x: { ticks: { font: { size: 11 } }, grid: { display: false } }
                }
            }
        });
    }
    ocultarLoadingLocal("chart-media-comparar");

    /* ════════════════════════════════════════════════════════════
       GRÁFICO 2: Evolução ao longo do tempo (linha)
    ════════════════════════════════════════════════════════════ */
    var periodosEvol = todosPeriodos ? _periodosComDados(turmas[0]) : periodosArr;
    var labelsEvol   = periodosEvol.map(function(p) {
        return p.t === "DIAGNÓSTICO" ? "Diag." : p.t.split(" ")[0];
    });
    var dsEvol = turmas.map(function(turma, idx) {
        return {
            label: turma,
            data: periodosEvol.map(function(p) {
                var v = calcularMediaTurmaPeriodoComparar(turma, p.v);
                return v > 0 ? parseFloat(v.toFixed(2)) : null;
            }),
            borderColor:     cores[idx % cores.length],
            backgroundColor: cores[idx % cores.length] + "22",
            tension: 0.4, fill: false,
            spanGaps: false, /* null = não conecta ponto vazio */
            pointRadius: 5, pointHoverRadius: 7, borderWidth: 2.5
        };
    });
    var nT = turmas.length;
    /* Estratégia adaptativa anti-sobreposição:
       ≤2 turmas → todos os pontos visíveis, alternância top/bottom
       3-5 turmas → só 1º e último ponto para evitar acúmulo no meio
       >5 turmas → só último ponto (final de cada linha)           */
    var _dlFontSize = Math.max(8, 11 - Math.max(0, nT - 2));
    var _dlDisplay  = function(ctx) {
        var val = ctx.dataset.data[ctx.dataIndex];
        if (val === null || val === undefined) return false;
        if (nT <= 2) return true;
        if (nT <= 5) return ctx.dataIndex === 0 || ctx.dataIndex === labelsEvol.length - 1;
        return ctx.dataIndex === labelsEvol.length - 1;
    };
    /* Alternância top/bottom por dataset — colisão mínima mesmo com valores iguais */
    var _dlAlign = function(ctx) {
        /* Par → bottom, Ímpar → top: dois datasets no mesmo ponto ficam em lados opostos */
        return ctx.datasetIndex % 2 === 0 ? "top" : "bottom";
    };
    /* Offset cresce por dataset para empurrar labels que ficam no mesmo lado */
    var _dlOffset = function(ctx) {
        return 5 + Math.floor(ctx.datasetIndex / 2) * 6;
    };

    compEvolucaoChart = _destroyChart(compEvolucaoChart);
    var c2 = _sharpCanvas("chart-evolucao-tempo");
    if (c2) {
        compEvolucaoChart = new Chart(c2, {
            type: "line",
            data: { labels: labelsEvol, datasets: dsEvol },
            options: {
                responsive: false, maintainAspectRatio: false,
                animation: { duration: 600, easing: "easeOutQuart" },
                /* top maior para labels do valor 14 não serem cortados */
                layout: { padding: { top: 48, right: 24, bottom: 8 } },
                plugins: {
                    legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 10 }, padding: 14 } },
                    tooltip: tooltipPremium,
                    datalabels: {
                        display: _dlDisplay,
                        anchor: "end",
                        align: _dlAlign,
                        offset: _dlOffset,
                        formatter: function(v) {
                            return (v !== null && v !== undefined) ? parseFloat(v).toFixed(1) : "";
                        },
                        font: { weight: "700", size: _dlFontSize },
                        color: function(ctx) { return ctx.dataset.borderColor; },
                        /* fundo branco garante leitura quando label cruza linha ou outra label */
                        backgroundColor: "rgba(255,255,255,0.85)",
                        borderRadius: 3,
                        padding: { top: 2, bottom: 2, left: 4, right: 4 }
                    }
                },
                scales: {
                    y: {
                        min: 0, max: 14,
                        ticks: { stepSize: 1, precision: 0, font: { size: 10 } },
                        grid: { color: "rgba(0,0,0,0.06)" }
                    },
                    x: { ticks: { font: { size: 10 } }, grid: { display: false } }
                }
            }
        });
    }

    /* ════════════════════════════════════════════════════════════
       HEATMAP: Distribuição por nível
    ════════════════════════════════════════════════════════════ */
    var distrib = turmas.map(function(turma) {
        var als  = _alunosTurma(turma, periodo);
        var cont = {};
        niveisOrdem.forEach(function(n) { cont[n] = 0; });
        als.forEach(function(nome) {
            cont[calcularNivel(_somaAluno(turma, periodo, nome)).txt]++;
        });
        return { turma: turma, cont: cont, total: als.length };
    });
    var tbl = "<table style=\"width:100%;border-collapse:collapse;font-size:12px;\"><thead><tr>"
        + "<th style=\"text-align:left;padding:6px 8px;font-size:10px;color:var(--texto-secundario);font-weight:700;border-bottom:1px solid var(--border);\">TURMA</th>";
    niveisOrdem.forEach(function(n) {
        tbl += "<th style=\"text-align:center;padding:4px;font-size:10px;color:var(--texto-secundario);font-weight:700;border-bottom:1px solid var(--border);\">"
            + n.replace("Leitor ","").replace("Pré-leitor ","Pré-") + "</th>";
    });
    tbl += "</tr></thead><tbody>";
    distrib.forEach(function(d) {
        tbl += "<tr><td style=\"padding:6px 8px;font-weight:600;font-size:12px;white-space:nowrap;border-bottom:1px solid #f1f5f9;\">" + d.turma + "</td>";
        niveisOrdem.forEach(function(nivel) {
            var qtd  = d.cont[nivel];
            var pct  = d.total > 0 ? Math.round((qtd / d.total) * 100) : 0;
            var cor  = coresNiveis[nivel];
            var bg   = pct >= 50 ? cor : pct >= 25 ? cor + "99" : pct > 0 ? cor + "44" : "#f8fafc";
            var txtC = pct >= 25 ? "#fff" : pct > 0 ? cor : "#94a3b8";
            tbl += "<td style=\"text-align:center;padding:4px;border-bottom:1px solid #f1f5f9;\">"
                + "<div style=\"background:" + bg + ";border-radius:8px;padding:6px 2px;min-width:52px;margin:auto;\">"
                + "<div style=\"color:" + txtC + ";font-weight:700;font-size:14px;\">" + pct + "%</div>"
                + "<div style=\"color:" + (txtC === "#fff" ? "rgba(255,255,255,0.75)" : "#94a3b8") + ";font-size:9px;\">" + qtd + " al.</div>"
                + "</div></td>";
        });
        tbl += "</tr>";
    });
    tbl += "</tbody></table>";
    document.getElementById("heatmap-distribuicao").innerHTML = tbl;

    /* ════════════════════════════════════════════════════════════
       KPIs
    ════════════════════════════════════════════════════════════ */
    var mds = turmas.map(function(t) {
        return { turma: t, media: _mediaTurma(t, periodo) };
    }).sort(function(a,b) { return b.media - a.media; });
    if (mds.length > 0) {
        document.getElementById("kpi-melhor-media-turma").innerText = mds[0].turma;
        document.getElementById("kpi-melhor-media-valor").innerText = mds[0].media.toFixed(1);
    }
    var evols = turmas.map(function(t) {
        /* Calcula evolução total e média por aluno */
        var als = _alunosTurma(t, periodo);
        var totalPts = 0;
        als.forEach(function(n) {
            var somaDiag  = calcularSomaAluno(t, "DIAG", n);
            var somaFinal = _somaAluno(t, periodo, n);
            totalPts += somaFinal - somaDiag;
        });
        var mediaPerAluno = als.length > 0 ? parseFloat((totalPts / als.length).toFixed(1)) : 0;
        /* diff continua sendo a diferença de médias (para o sort funcionar igual) */
        var diff = _mediaTurma(t, periodo) - calcularMediaTurmaPeriodoComparar(t, "DIAG");
        return { turma: t, diff: diff, totalPts: totalPts, mediaPerAluno: mediaPerAluno };
    }).sort(function(a,b) { return b.diff - a.diff; });
    if (evols.length > 0) {
        document.getElementById("kpi-maior-evolucao-turma").innerText = evols[0].turma;
        var _ePts  = evols[0].totalPts;
        var _eMed  = evols[0].mediaPerAluno;
        var _eSign = _ePts >= 0 ? "+" : "";
        var _mSign = _eMed >= 0 ? "+" : "";
        document.getElementById("kpi-maior-evolucao-valor").innerHTML =
            "<span style=\"font-size:20px;font-weight:800;color:" + (_ePts >= 0 ? "var(--cor-sucesso)" : "var(--cor-perigo)") + ";\">"
            + _eSign + _ePts + " pts</span>"
            + "<span style=\"font-size:11px;color:var(--texto-secundario);font-weight:600;font-style:normal;display:block;margin-top:3px;\">"
            + _mSign + _eMed + " média/aluno</span>";
    }
    var mP = -1, mT = "-", mV = "-";
    turmas.forEach(function(t) {
        var als = _alunosTurma(t, periodo); if (!als.length) return;
        var pct = (als.filter(function(n) {
            return ["Leitor fluente","Leitor avançado"].includes(calcularNivel(_somaAluno(t, periodo, n)).txt);
        }).length / als.length) * 100;
        if (pct > mP) { mP = pct; mT = t; mV = Math.round(pct) + "%"; }
    });
    document.getElementById("kpi-avancados-turma").innerText = mT;
    document.getElementById("kpi-avancados-valor").innerText = mV;
    var pP = -1, pT = "-", pV = "-";
    turmas.forEach(function(t) {
        var als = _alunosTurma(t, periodo); if (!als.length) return;
        var pct = (als.filter(function(n) {
            return ["Pré-leitor 1","Pré-leitor 2"].includes(calcularNivel(_somaAluno(t, periodo, n)).txt);
        }).length / als.length) * 100;
        if (pct > pP) { pP = pct; pT = t; pV = Math.round(pct) + "%"; }
    });
    document.getElementById("kpi-atencao-turma").innerText = pT;
    document.getElementById("kpi-atencao-valor").innerText = pV;
    document.getElementById("kpi-total-alunos-valor").innerText =
        turmas.reduce(function(s,t) { return s + _alunosTurma(t, periodo).length; }, 0);
    ocultarLoadingLocal("chart-evolucao-tempo");

    /* ════════════════════════════════════════════════════════════
       GRÁFICO 3 (grande): Domínio de habilidades
       — usa MESMA fórmula da aba Lançamentos:
         pct = Math.round((somaNotas / (nAlunos * 2)) * 100)
       — considera PARCIAL (1) proporcionalmente, não só SIM (2)
       — mostra evolução DIAG → período selecionado no tooltip
    ════════════════════════════════════════════════════════════ */
    var labsHab = ["Letras","Síl. simples","Palavras simples","Frases simples",
                   "Síl. complexas","Pal./Frases complexas","Fluência"];

    /* Determina o período base e o período de comparação para evolução */
    var _getUltimoPeriodoValido = function(turma) {
        var periodos = _periodosComDados(turma);
        return periodos.length ? periodos[periodos.length - 1].v : "DIAG";
    };

    /* Calcula % de domínio IGUAL à aba Lançamentos:
       soma de todas as notas / (n_alunos * 2) * 100
       Considera SIM=2, PARCIAL=1, NAO=0 proporcionalmente */
    var _pctHabilidade = function(turma, per, hi) {
        var als = JSON.parse(localStorage.getItem(chaveAlunos(turma, per))) || [];
        if (!als.length) return null; /* null = sem dados, não zero */
        var soma = als.reduce(function(s, nome) {
            return s + (parseInt(getNotaHabilidade(turma, per, nome, hi)) || 0);
        }, 0);
        return Math.round((soma / (als.length * 2)) * 100);
    };

    var datasetsHab = turmas.map(function(turma, idx) {
        /* Período final: se "TODOS" → último válido, senão → período selecionado */
        var perFinal = todosPeriodos ? _getUltimoPeriodoValido(turma) : periodo;
        var perDiag  = "DIAG";

        var pcts = labsHab.map(function(_, hi) {
            var v = _pctHabilidade(turma, perFinal, hi);
            return v !== null ? v : 0;
        });
        /* Evolução por habilidade: pct_final - pct_diag */
        var evolucoes = labsHab.map(function(_, hi) {
            var vDiag  = _pctHabilidade(turma, perDiag,  hi) || 0;
            var vFinal = _pctHabilidade(turma, perFinal, hi) || 0;
            return vFinal - vDiag;
        });

        var cor = cores[idx % cores.length];
        return {
            label:     turma,
            data:      pcts,
            _evolucoes: evolucoes,     /* guardado para uso no tooltip */
            _perFinal:  perFinal,
            backgroundColor: cor + "BB",
            borderColor:     cor,
            borderWidth: 1.5, borderRadius: 8, borderSkipped: false, hoverBorderWidth: 2.5
        };
    });

    compHabilidadesChart = _destroyChart(compHabilidadesChart);
    var c3 = _sharpCanvas("chart-habilidades-comparar");
    if (c3) {
        /* Fonte adaptativa: quanto mais turmas, menor a fonte para caber nas barras */
        var _habFontMain = Math.max(8, 13 - turmas.length);
        var _habFontEvo  = Math.max(7, 10 - turmas.length);
        /* Oculta label de evolução quando há muitas turmas (muito estreito) */
        var _showEvo = turmas.length <= 5;

        compHabilidadesChart = new Chart(c3, {
            type: "bar",
            data: { labels: labsHab, datasets: datasetsHab },
            options: {
                responsive: false, maintainAspectRatio: false,
                animation: { duration: 700, easing: "easeOutQuart" },
                layout: { padding: { top: _showEvo ? 56 : 36 } }, /* espaço p/ 2 linhas */
                plugins: {
                    legend: {
                        position: "top",
                        labels: { boxWidth: 14, font: { size: 11 }, padding: 18 }
                    },
                    tooltip: Object.assign({}, tooltipPremium, {
                        callbacks: {
                            title: function(items) { return labsHab[items[0].dataIndex]; },
                            label: function(ctx) {
                                var evo = ctx.dataset._evolucoes[ctx.dataIndex];
                                var evoStr = evo > 0 ? " +" + evo + "%" : evo < 0 ? " " + evo + "%" : " 0%";
                                return " " + ctx.dataset.label + ": " + ctx.parsed.y + "% domínio | evolução: " + evoStr;
                            }
                        }
                    }),
                    /* Dois labels independentes por barra: % principal + evolução */
                    datalabels: {
                        labels: {
                            /* LINHA 1: porcentagem principal — grande, negrito, escuro */
                            pct: {
                                anchor: "end",
                                align: "top",
                                offset: 2,
                                display: function(ctx) {
                                    return ctx.dataset.data[ctx.dataIndex] > 0;
                                },
                                formatter: function(v) {
                                    return v > 0 ? v + "%" : null;
                                },
                                font: { weight: "800", size: _habFontMain },
                                color: "#0f172a"
                            },
                            /* LINHA 2: evolução — menor, verde se positiva, vermelha se negativa */
                            evo: {
                                anchor: "end",
                                align: "top",
                                /* empilha abaixo do label pct calculando altura da fonte */
                                offset: 2 + _habFontMain + 4,
                                display: function(ctx) {
                                    if (!_showEvo) return false;
                                    var v   = ctx.dataset.data[ctx.dataIndex];
                                    var evo = ctx.dataset._evolucoes && ctx.dataset._evolucoes[ctx.dataIndex];
                                    return v > 0 && evo !== 0 && evo !== undefined;
                                },
                                formatter: function(v, ctx) {
                                    if (!v) return null;
                                    var evo = ctx.dataset._evolucoes && ctx.dataset._evolucoes[ctx.dataIndex];
                                    if (!evo) return null;
                                    return (evo > 0 ? "+" : "") + evo + "%";
                                },
                                font: { weight: "700", size: _habFontEvo },
                                color: function(ctx) {
                                    var evo = ctx.dataset._evolucoes && ctx.dataset._evolucoes[ctx.dataIndex];
                                    return evo > 0 ? "#16a34a" : "#dc2626";
                                }
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true, max: 110,
                        ticks: {
                            stepSize: 10,
                            callback: function(v) { return v <= 100 ? v + "%" : ""; },
                            font: { size: 10 }
                        },
                        grid: { color: "rgba(0,0,0,0.06)" }
                    },
                    x: {
                        ticks: { font: { size: 10 }, maxRotation: 25 },
                        grid: { display: false }
                    }
                }
            }
        });
    }
    ocultarLoadingLocal("chart-habilidades-comparar");
}
/* ════════════════════════════════════════════════════════════════
   COMPARAR ALUNOS
════════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════════
   COMPARAR ALUNOS — arquitectura definitiva
   KPIs   → seguem filtros do topo (turma + período)
   Gráficos → seguem seleção manual de até 5 alunos
════════════════════════════════════════════════════════════════ */
var _caAlunos    = [];   /* [{nome, turma, cor, fotoUrl}] selecionados p/ gráficos */
var _caAllAlunos = [];   /* lista completa p/ seletor modal */
var _caChartInst = null;
var _caCores     = [
    "#6366f1","#10b981","#3b82f6","#f59e0b","#ef4444",
    "#8b5cf6","#0ea5e9","#84cc16","#ec4899","#14b8a6"
];

/* ── Inicialização ─────────────────────────────────────────── */
function caInicializar() {
    caPopularTurmas();
    caPopularPeriodos();
    caCarregarAlunos();
    caRenderizarKPIs();
    caRenderizarChips();
    caRenderizarGraficos();
    /* Delegacao de clique para fotos de alunos nos KPIs */
    var kpiGrid = document.getElementById("ca-kpi-grid");
    if (kpiGrid && !kpiGrid._fotoClick) {
        kpiGrid._fotoClick = true;
        kpiGrid.addEventListener("click", function(e) {
            var el = e.target;
            if (el.classList && el.classList.contains("ca-avatar-foto")) {
                caAbrirFotoModal(el.getAttribute("data-foto-url"), el.getAttribute("data-foto-nome"));
            }
        });
        kpiGrid.addEventListener("mouseover", function(e) {
            if (e.target.classList && e.target.classList.contains("ca-avatar-foto")) {
                e.target.style.transform = "scale(1.12)";
            }
        });
        kpiGrid.addEventListener("mouseout", function(e) {
            if (e.target.classList && e.target.classList.contains("ca-avatar-foto")) {
                e.target.style.transform = "scale(1)";
            }
        });
    }
}

function caPopularTurmas() {
    var sel = document.getElementById("ca-turma-select");
    if (!sel) return;
    var atual = sel.value;
    sel.innerHTML = "<option value=\'\'>Todas as turmas</option>";
    getTurmasVisiveis().forEach(function(t) {
        var nome = normalizarTurma(typeof t === "object" ? t.nome : t);
        var o = document.createElement("option");
        o.value = nome; o.text = nome.toUpperCase();
        if (nome === atual) o.selected = true;
        sel.appendChild(o);
    });
}

function caPopularPeriodos() {
    var sel = document.getElementById("ca-periodo-select");
    if (!sel) return;
    var atual = sel.value;
    sel.innerHTML = "<option value=\'\'>Todos os períodos</option>";
    periodosArr.forEach(function(p) {
        var o = document.createElement("option");
        o.value = p.v; o.text = p.t;
        if (p.v === atual) o.selected = true;
        sel.appendChild(o);
    });
}

function caOnTurmaChange() {
    _caAlunos = []; /* limpa seleção ao trocar turma */
    caCarregarAlunos();
    caRenderizarKPIs();
    caRenderizarChips();
    caRenderizarGraficos();
}

function caOnPeriodoChange() {
    caRenderizarKPIs();
}

/* ── Lista de alunos disponíveis p/ seletor ────────────────── */
function caCarregarAlunos() {
    var turmaSel = normalizarTurma(document.getElementById("ca-turma-select").value || "");
    _caAllAlunos = [];
    var turmasFiltro = turmaSel
        ? [turmaSel]
        : getTurmasVisiveis().map(function(t){ return normalizarTurma(typeof t==="object"?t.nome:t); });

    turmasFiltro.forEach(function(turma) {
        periodosArr.forEach(function(p) {
            var als = getAlunos(p.v, turma);
            als.forEach(function(nome) {
                nome = normalizarAluno(nome);
                if (!_caAllAlunos.find(function(a){ return a.nome===nome && a.turma===turma; })) {
                    _caAllAlunos.push({ nome: nome, turma: turma });
                }
            });
        });
    });
    _caAllAlunos.sort(function(a,b){ return a.nome.localeCompare(b.nome,"pt-BR"); });
}

/* ── KPI CARDS — seguem filtros do topo ───────────────────── */
function caRenderizarKPIs() {
    var container = document.getElementById("ca-kpi-grid");
    if (!container) return;

    var turmaSel  = normalizarTurma(document.getElementById("ca-turma-select").value || "");
    var periodoSel = normalizarPeriodo((document.getElementById("ca-periodo-select") || {}).value || "");
    var ehDiag    = periodoSel === "DIAG";
    var ehTodos   = !periodoSel;

    var turmasFiltro = turmaSel
        ? [turmaSel]
        : getTurmasVisiveis().map(function(t){ return normalizarTurma(typeof t==="object"?t.nome:t); });

    /* Ordem dos períodos não-DIAG: 1BIM, 2BIM, 3BIM, 4BIM */
    var persSemDiag = periodosArr.filter(function(p){ return p.v !== "DIAG"; });

    /* Índice de um período no array */
    function idxPer(v) { return persSemDiag.findIndex(function(p){ return p.v === v; }); }

    /* Soma de um período anterior ao selecionado (para comparação entre bimestres consecutivos) */
    function somaPerAnterior(turma, nome, periodoAtual) {
        var idx = idxPer(periodoAtual);
        if (idx <= 0) return calcularSomaAluno(turma, "DIAG", nome); /* 1BIM compara com DIAG */
        return calcularSomaAluno(turma, persSemDiag[idx-1].v, nome);
    }

    /* Último período com soma > 0 */
    function ultimoPerReal(turma, nome) {
        for (var i = persSemDiag.length - 1; i >= 0; i--) {
            var s = calcularSomaAluno(turma, persSemDiag[i].v, nome);
            if (s > 0) return { v: persSemDiag[i].v, idx: i, soma: s };
        }
        return null;
    }

    /* Conta quantos períodos consecutivos o aluno ficou SEM EVOLUIR antes do último período.
       Precisa de pelo menos 2 períodos lançados para haver estagnação.
       Percorre do penúltimo período para trás contando enquanto a soma == somaUlt. */
    function contarPersSemEvo(turma, nome, somaUlt) {
        /* Coleta apenas os períodos que têm lançamento real */
        var comDado = persSemDiag.filter(function(p){
            return calcularSomaAluno(turma, p.v, nome) > 0;
        });
        /* Precisa de pelo menos 2 períodos lançados para afirmar estagnação */
        if (comDado.length < 2) return 0;
        /* Conta pares consecutivos de trás para frente onde o aluno não cresceu.
           Par a par: se período[i] >= período[i+1] = não evoluiu naquele passo.
           Para quando encontra um par onde o aluno cresceu. */
        var count = 0;
        for (var i = comDado.length - 2; i >= 0; i--) {
            var sAtual   = calcularSomaAluno(turma, comDado[i].v,   nome); /* período anterior */
            var sProximo = calcularSomaAluno(turma, comDado[i+1].v, nome); /* período seguinte */
            if (sAtual >= sProximo) {
                count++; /* não cresceu neste passo */
            } else {
                break; /* cresceu aqui — sequência de estagnação termina */
            }
        }
        return count;
    }

    /* ── Coleta alunos ── */
    var dadosMap = {};
    var periodosFiltro = periodoSel ? [periodoSel] : periodosArr.map(function(p){ return p.v; });

    turmasFiltro.forEach(function(turma) {
        periodosFiltro.forEach(function(per) {
            var als = getAlunos(per, turma);
            als.forEach(function(nome) {
                nome = normalizarAluno(nome);
                var chave = nome + "|" + turma;
                if (dadosMap[chave]) return;

                var somaDiag  = calcularSomaAluno(turma, "DIAG", nome);
                var somaAtual, somaBase, temComparacao, persSemEvoCount = 0;

                if (ehDiag) {
                    /* Diagnóstico: sem comparação */
                    somaAtual     = somaDiag;
                    somaBase      = 0;
                    temComparacao = false;

                } else if (ehTodos) {
                    /* Todos os períodos: DIAG vs último período real */
                    var ultPer = ultimoPerReal(turma, nome);
                    somaAtual  = ultPer ? ultPer.soma : somaDiag;
                    somaBase   = somaDiag;
                    temComparacao = somaDiag > 0 && ultPer !== null;
                    if (temComparacao) {
                        persSemEvoCount = contarPersSemEvo(turma, nome, somaAtual);
                    }

                } else {
                    /* Período específico: período anterior vs período selecionado
                       1BIM → DIAG vs 1BIM
                       2BIM → 1BIM vs 2BIM
                       3BIM → 2BIM vs 3BIM
                       4BIM → 3BIM vs 4BIM  */
                    var somaPerSel = calcularSomaAluno(turma, periodoSel, nome);
                    somaAtual      = somaPerSel > 0 ? somaPerSel : 0;
                    somaBase       = somaPerAnterior(turma, nome, periodoSel);
                    temComparacao  = somaAtual > 0 && somaBase > 0;
                    if (temComparacao && somaAtual === somaBase) persSemEvoCount = 1;
                }

                var evo = temComparacao ? somaAtual - somaBase : 0;

                /* Busca foto no _cacheAlunos.
                   A chave do cache é turmaId+"|"+nome (ID numérico, não nome da turma),
                   então percorremos as entradas comparando nome para encontrar a foto.
                   Como turmaId é desconhecido aqui, usamos o nome do aluno como filtro
                   (risco de homônimo é baixo e aceitável neste contexto de KPI). */
                var _fotoKpi = null;
                if (typeof _cacheAlunos !== "undefined") {
                    var _nomeKpiN = String(nome||'').trim().toLowerCase();
                    var _keysKpi = Object.keys(_cacheAlunos);
                    var _matchSemFoto = false;
                    for (var _ki3 = 0; _ki3 < _keysKpi.length; _ki3++) {
                        var _chaveKpi = _keysKpi[_ki3];
                        var _eKpi = _cacheAlunos[_chaveKpi];
                        if (_eKpi && typeof _eKpi === "object" && typeof _eKpi.nome === "string"
                                && _eKpi.nome.trim().toLowerCase() === _nomeKpiN) {
                            if (_eKpi.foto_url) {
                                _fotoKpi = _eKpi.foto_url;
                                break;
                            } else {
                                _matchSemFoto = true;
                            }
                        }
                    }
                }

                dadosMap[chave] = {
                    nome: nome, turma: turma,
                    soma: somaAtual, base: somaBase, evo: evo,
                    nivel: calcularNivel(somaAtual),
                    temComparacao: temComparacao,
                    persSemEvo: persSemEvoCount,
                    fotoUrl: _fotoKpi
                };
            });
        });
    });
    var dados = Object.keys(dadosMap).map(function(k){ return dadosMap[k]; });

    /* ── KPI 1 e 2: Fluentes e Atenção ── */
    var fluentes = dados.filter(function(d){ return d.nivel.txt === "Leitor fluente"; });
    var criticos = dados.filter(function(d){ return d.nivel.txt === "Pré-leitor 1"; });

    var msgSemComp = ehDiag
        ? "Não há período anterior para comparação."
        : "Necessário mais de um período lançado.";
    var podeComparar = !ehDiag && dados.some(function(d){ return d.temComparacao; });

    /* ── KPI 4: Menor Evolução (calculado ANTES do 3 para exclusão mútua) ──
       CASO 1: não evoluiu (evo=0) E soma <= 10
       CASO 2: evoluiu mas está estagnado ≤ 6 (persSemEvo >= 1)
       CASO 3: regrediu (evo < 0) — qualquer pontuação */
    var menEvoSet = {}; /* chave dos alunos já em menor evolução */
    var menEvo = !podeComparar ? [] : dados.filter(function(d) {
        if (!d.temComparacao) return false;
        var caso1 = d.evo === 0 && d.soma <= 10;
        var caso2 = d.soma <= 6 && d.persSemEvo >= 1;
        var caso3 = d.evo < 0;
        var entra = caso1 || caso2 || caso3;
        if (entra) menEvoSet[d.nome + "|" + d.turma] = true;
        return entra;
    }).sort(function(a,b){ return a.evo - b.evo; });

    /* ── KPI 3: Maior Evolução — exclui quem está em Menor Evolução ── */
    var topEvo = !podeComparar ? [] : dados.filter(function(d) {
        if (!d.temComparacao) return false;
        if (menEvoSet[d.nome + "|" + d.turma]) return false; /* exclusão mútua */
        return d.evo > 0;
    }).sort(function(a,b){ return b.evo - a.evo; });

    /* ── Label de evolução (só para Menor Evolução) ── */
    function evoLabelMenor(d) {
        var pts = (d.evo > 0 ? "+" : "") + d.evo + " pts";
        if (d.persSemEvo >= 1) {
            var txt = d.persSemEvo === 1
                ? "1 período sem evolução"
                : d.persSemEvo + " períodos sem evolução";
            return pts + "<br><span style='font-size:9px;color:#f97316;font-weight:600;'>" + txt + "</span>";
        }
        return pts;
    }

    /* Label simples para Maior Evolução */
    function evoLabelMaior(d) {
        return (d.evo > 0 ? "+" : "") + d.evo + " pts";
    }

    /* ── Modal foto aluno ── */
    window.caAbrirFotoModal = function(url, nome) {
        var existing = document.getElementById("ca-foto-modal");
        if (existing) existing.remove();
        if (!document.getElementById("ca-foto-style")) {
            var s = document.createElement("style");
            s.id = "ca-foto-style";
            s.textContent = "@keyframes caFadeIn{from{opacity:0}to{opacity:1}}";
            document.head.appendChild(s);
        }
        var overlay = document.createElement("div");
        overlay.id = "ca-foto-modal";
        overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;animation:caFadeIn 0.15s ease;";
        var inner = document.createElement("div");
        inner.style.cssText = "position:relative;display:flex;flex-direction:column;align-items:center;gap:12px;";
        var img = document.createElement("img");
        img.src = url;
        img.style.cssText = "width:220px;height:220px;border-radius:50%;object-fit:cover;box-shadow:0 8px 32px rgba(0,0,0,0.5);";
        var label = document.createElement("span");
        label.style.cssText = "color:#fff;font-size:14px;font-weight:600;text-shadow:0 1px 4px rgba(0,0,0,0.5);";
        label.textContent = nome;
        var btn = document.createElement("button");
        btn.textContent = "\u00d7";
        btn.style.cssText = "position:absolute;top:-14px;right:-14px;width:32px;height:32px;border-radius:50%;background:#fff;border:none;font-size:18px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#1e293b;box-shadow:0 2px 8px rgba(0,0,0,0.3);line-height:1;";
        btn.onclick = function() { overlay.remove(); };
        inner.appendChild(img);
        inner.appendChild(label);
        inner.appendChild(btn);
        overlay.appendChild(inner);
        overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    };

    /* ── Avatar ── */
    function avatarHtml(nome, fotoUrl, size) {
        size = size || 38;
        var inicial = nome ? nome.charAt(0).toUpperCase() : "?";
        var cores = ["#6366f1","#10b981","#3b82f6","#f59e0b","#ef4444","#8b5cf6","#0ea5e9","#ec4899"];
        var cor = cores[nome.charCodeAt(0) % cores.length];
        if (fotoUrl) {
            return "<img src='" + fotoUrl + "'"
                + " data-foto-url='" + fotoUrl + "'"
                + " data-foto-nome='" + nome.replace(/'/g, "&#39;") + "'"
                + " class='ca-avatar-foto'"
                + " style='width:" + size + "px;height:" + size + "px;border-radius:50%;object-fit:cover;flex-shrink:0;cursor:pointer;transition:transform 0.15s;'>";
        }
        return "<div style='width:" + size + "px;height:" + size + "px;border-radius:50%;background:" + cor + ";display:flex;align-items:center;justify-content:center;font-size:" + Math.round(size*0.4) + "px;font-weight:700;color:#fff;flex-shrink:0;'>" + inicial + "</div>";
    }

    /* ── Lista com "Ver mais" (3 visíveis, scroll acima de 9) ── */
    var _kpiVerMaisId = 0;
    function listaKpi(lista, labelFn) {
        if (!lista.length) return "<div style='font-size:11px;color:var(--texto-desabilitado);text-align:center;padding:10px 0;'>Nenhum aluno</div>";
        var uid = "kpi-vm-" + (++_kpiVerMaisId);
        var rows = lista.map(function(d, i) {
            var infoBottom = "<span style='font-size:10px;color:var(--texto-secundario);font-weight:600;'>" + d.turma + "</span>";
            var evoRight = labelFn
                ? "<span style='font-weight:800;font-size:12px;flex-shrink:0;line-height:1.3;text-align:right;color:" + (d.evo>0?"#10b981":d.evo<0?"#ef4444":"#94a3b8") + ";'>" + labelFn(d) + "</span>"
                : "";
            return "<div class='kpi-item-row' data-kpi-grp='" + uid + "' style='display:" + (i<3?"flex":"none") + ";align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-subtle);flex-shrink:0;'>"
                + avatarHtml(d.nome, d.fotoUrl, 38)
                + "<div style='flex:1;min-width:0;'>"
                + "<div style='font-size:12px;font-weight:700;color:var(--texto-primario);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'>" + d.nome + "</div>"
                + infoBottom + "</div>"
                + evoRight + "</div>";
        }).join("");
        var temMais = lista.length > 3;
        var html = "<div class='kpi-lista-wrap' id='wrap_" + uid + "'>" + rows + "</div>";
        if (temMais) {
            html += "<button onclick='caToggleVerMais(this,\"" + uid + "\"," + lista.length + ")' "
                + "style='width:100%;margin-top:6px;background:none;border:none;color:var(--cor-primaria);font-size:11px;"
                + "font-weight:700;cursor:pointer;padding:3px 0;text-align:center;'>Ver mais (+" + (lista.length-3) + ")</button>";
        }
        return html;
    }

    var msgDiv = "<div style='font-size:11px;color:var(--texto-desabilitado);padding:14px 0;text-align:center;'>" + msgSemComp + "</div>";

    container.innerHTML =
        "<div class='ca-kpi ca-kpi-fluente'>"
        +"<div class='ca-kpi-head'><div class='ca-kpi-ico'><i class='fas fa-star'></i></div>"
        +"<div><div class='ca-kpi-lbl'>Leitores Fluentes</div><div class='ca-kpi-sub'>Nível máximo atingido</div></div></div>"
        +"<div class='ca-kpi-val'>" + fluentes.length + "</div><div class='ca-kpi-val-lbl'>alunos</div>"
        +"<div class='ca-kpi-alunos'>" + listaKpi(fluentes, null) + "</div></div>"

        +"<div class='ca-kpi ca-kpi-critico'>"
        +"<div class='ca-kpi-head'><div class='ca-kpi-ico'><i class='fas fa-exclamation-triangle'></i></div>"
        +"<div><div class='ca-kpi-lbl'>Atenção</div><div class='ca-kpi-sub'>Pré-leitor 1 — precisam de apoio</div></div></div>"
        +"<div class='ca-kpi-val'>" + criticos.length + "</div><div class='ca-kpi-val-lbl'>alunos</div>"
        +"<div class='ca-kpi-alunos'>" + listaKpi(criticos, null) + "</div></div>"

        +"<div class='ca-kpi ca-kpi-maior-evo'>"
        +"<div class='ca-kpi-head'><div class='ca-kpi-ico'><i class='fas fa-arrow-trend-up'></i></div>"
        +"<div><div class='ca-kpi-lbl'>Maior Evolução</div><div class='ca-kpi-sub'>Pontos ganhos no período</div></div></div>"
        +(!podeComparar ? msgDiv
            : "<div class='ca-kpi-val' style='color:#2563eb;'>" + topEvo.length + "</div><div class='ca-kpi-val-lbl'>alunos</div>"
              +"<div class='ca-kpi-alunos'>" + listaKpi(topEvo, evoLabelMaior) + "</div>"
        )+"</div>"

        +"<div class='ca-kpi ca-kpi-menor-evo'>"
        +"<div class='ca-kpi-head'><div class='ca-kpi-ico'><i class='fas fa-bolt'></i></div>"
        +"<div><div class='ca-kpi-lbl'>Menor Evolução</div><div class='ca-kpi-sub'>Alunos que precisam de atenção</div></div></div>"
        +(!podeComparar ? msgDiv
            : "<div class='ca-kpi-val' style='color:#f97316;'>" + menEvo.length + "</div><div class='ca-kpi-val-lbl'>alunos</div>"
              +"<div class='ca-kpi-alunos'>" + listaKpi(menEvo, evoLabelMenor) + "</div>"
        )+"</div>";
}

/* Toggle Ver mais — scroll interno acima de 9 alunos */
function caToggleVerMais(btn, uid, total) {
    var grp  = document.querySelectorAll("[data-kpi-grp='" + uid + "']");
    var wrap = document.getElementById("wrap_" + uid);
    var ocultos = Array.prototype.filter.call(grp, function(el){ return el.style.display === "none"; });
    var expanded = ocultos.length === 0;
    if (expanded) {
        grp.forEach(function(el, i){ el.style.display = i < 3 ? "flex" : "none"; });
        if (wrap) { wrap.style.maxHeight = ""; wrap.style.overflowY = ""; }
        btn.textContent = "Ver mais (+" + (total-3) + ")";
    } else {
        grp.forEach(function(el){ el.style.display = "flex"; });
        if (wrap && total > 9) { wrap.style.maxHeight = "423px"; wrap.style.overflowY = "auto"; }
        btn.textContent = "Ver menos";
    }
}


/* ── Seletor modal ─────────────────────────────────────────── */
function caAbrirSeletorAlunos() {
    if (_caAlunos.length >= 5) {
        mostrarModalAviso("Limite atingido","Você pode comparar no máximo 5 alunos simultaneamente."); return;
    }
    var m = document.getElementById("ca-modal-alunos");
    document.getElementById("ca-busca-aluno").value = "";
    caFiltrarListaAlunos();
    m.classList.add("visible");
    setTimeout(function(){ document.getElementById("ca-busca-aluno").focus(); }, 100);
}
function caFecharSeletor() {
    document.getElementById("ca-modal-alunos").classList.remove("visible");
}
function caFiltrarListaAlunos() {
    var busca = document.getElementById("ca-busca-aluno").value.toLowerCase();
    var lista = document.getElementById("ca-lista-alunos-modal");
    var filtrados = _caAllAlunos.filter(function(a){
        return a.nome.toLowerCase().includes(busca);
    });
    if (filtrados.length === 0) {
        lista.innerHTML = "<div style=\'padding:16px;color:var(--texto-desabilitado);font-size:12px;text-align:center;\'>Nenhum aluno encontrado</div>";
        return;
    }
    lista.innerHTML = filtrados.map(function(a, idx) {
        var jaSel = _caAlunos.find(function(s){ return s.nome===a.nome && s.turma===a.turma; });
        return "<div class=\'ca-modal-aluno-item"+(jaSel?" selected":"")+"\'"
            +" data-idx=\'"+idx+"\' onclick=\'caToggleAlunoIdx(this)\'>"
            +"<div>"
            +"<div style=\'font-size:13px;font-weight:600;color:"+(jaSel?"var(--cor-primaria)":"var(--texto-primario)")+";\'>"+a.nome+"</div>"
            +"<div class=\'ca-modal-aluno-turma\'>"+a.turma+"</div>"
            +"</div>"
            +(jaSel?"<i class=\'fas fa-check\' style=\'color:var(--cor-primaria);font-size:13px;\'></i>":"<i class=\'fas fa-plus\' style=\'color:var(--texto-desabilitado);font-size:13px;\'></i>")
            +"</div>";
    }).join("");
}
function caToggleAlunoIdx(el) {
    var idx = parseInt(el.getAttribute("data-idx"));
    var a   = _caAllAlunos[idx];
    if (a) caToggleAluno(a.nome, a.turma);
}
function caToggleAluno(nome, turma) {
    nome  = normalizarAluno(nome);
    turma = normalizarTurma(turma);
    var idx = _caAlunos.findIndex(function(a){ return a.nome===nome && a.turma===turma; });
    if (idx >= 0) {
        _caAlunos.splice(idx, 1);
        _caAlunos.forEach(function(a,i){ a.cor = _caCores[i]; });
    } else {
        if (_caAlunos.length >= 5) return;
        /* Busca foto do cache local (preenchido por sbBuscarAlunos) */
        var _fotoAluno = null;
        if (typeof _cacheAlunos !== "undefined") {
            var _anoId   = alGetAnoSelecionadoId ? alGetAnoSelecionadoId() : null;
            var _nomeToggleN = nome.trim().toLowerCase();
            /* Tenta encontrar o aluno pelo nome em alguma entrada do cache */
            var _cacheKeys = Object.keys(_cacheAlunos);
            for (var _ki = 0; _ki < _cacheKeys.length; _ki++) {
                var _entry = _cacheAlunos[_cacheKeys[_ki]];
                if (_entry && typeof _entry === "object"
                        && typeof _entry.nome === "string"
                        && _entry.nome.trim().toLowerCase() === _nomeToggleN
                        && _entry.foto_url) {
                    _fotoAluno = _entry.foto_url; break;
                }
            }
        }
        _caAlunos.push({ nome:nome, turma:turma, cor:_caCores[_caAlunos.length], fotoUrl:_fotoAluno });
    }
    caFiltrarListaAlunos();
    caRenderizarChips();
    caRenderizarGraficos();
}
function caRemoverAluno(idx) {
    _caAlunos.splice(idx, 1);
    _caAlunos.forEach(function(a,i){ a.cor = _caCores[i]; });
    caRenderizarChips();
    caRenderizarGraficos();
}
function caLimparSelecao() {
    _caAlunos = [];
    caRenderizarChips();
    caRenderizarGraficos();
}

/* ── Chips ─────────────────────────────────────────────────── */
function caRenderizarChips() {
    var row   = document.getElementById("ca-chips-row");
    var badge = document.getElementById("ca-count-badge");
    if (!row) return;
    badge.textContent = _caAlunos.length + "/5";
    var html = _caAlunos.map(function(a,i){
        return "<div class=\'ca-chip\'>"
            +"<span class=\'ca-chip-color\' style=\'background:"+a.cor+";\'></span>"
            +"<span>"+a.nome+"</span>"
            +"<button class=\'ca-chip-remove\' onclick=\'caRemoverAluno("+i+")\'><i class=\'fas fa-times\'></i></button>"
            +"</div>";
    }).join("");
    var dis = _caAlunos.length >= 5 ? " disabled" : "";
    html += "<button class=\'ca-btn-add\'"+dis+" onclick=\'caAbrirSeletorAlunos()\'><i class=\'fas fa-plus\'></i> Adicionar</button>";
    row.innerHTML = html;
}

/* ── Gráficos (seguem seleção de alunos) ───────────────────── */
function caRenderizarGraficos() {
    var empty    = document.getElementById("ca-empty-state");
    var conteudo = document.getElementById("ca-conteudo");
    if (_caAlunos.length === 0) {
        empty.style.display    = "flex";
        conteudo.style.display = "none";
        _caChartInst = _destroyChart(_caChartInst);
        return;
    }
    empty.style.display    = "none";
    conteudo.style.display = "block";
    caRenderizarGraficoEvolucao();
    caRenderizarTabela();
}

function caRenderizarGraficoEvolucao() {
    _caChartInst = _destroyChart(_caChartInst);
    var canvas = document.getElementById("ca-chart-evolucao");
    if (!canvas) return;
    /* sharp canvas */
    var dpr = window.devicePixelRatio || 1;
    var wrap = canvas.parentElement;
    var w = wrap.offsetWidth || 400, h = wrap.offsetHeight || 300;
    canvas.width = Math.round(w*dpr); canvas.height = Math.round(h*dpr);
    canvas.style.width = w+"px"; canvas.style.height = h+"px";
    var ctx = canvas.getContext("2d"); ctx.scale(dpr, dpr);

    var labels = periodosArr.map(function(p){
        if (p.t === "DIAGNÓSTICO") return "Diag.";
        /* p.t ex: "1º BIMESTRE" → split[0] = "1º" → já tem o ordinal, só trocar sufixo */
        var num = p.t.split(" ")[0].replace("º","").replace("°","");
        return num + "º Bi.";
    });
    var datasets = _caAlunos.map(function(a) {
        return {
            label: a.nome,
            data: periodosArr.map(function(p){ return calcularSomaAluno(a.turma, p.v, a.nome); }),
            borderColor: a.cor, backgroundColor: a.cor+"22",
            tension: 0.4, fill: false,
            pointRadius: 5, pointHoverRadius: 7,
            borderWidth: 2.5, pointBackgroundColor: a.cor
        };
    });
    _caChartInst = new Chart(canvas, {
        type: "line",
        data: { labels: labels, datasets: datasets },
        options: {
            responsive: false, maintainAspectRatio: false,
            animation: { duration: 500, easing: "easeOutQuart" },
            layout: {},
            plugins: {
                legend: { display: false },
                datalabels: {
                    display: function(ctx){ return ctx.dataIndex === periodosArr.length-1; },
                    anchor:"end", align:"right",
                    formatter: function(v){ return v; },
                    font:{weight:"bold",size:10},
                    color: function(ctx){ return ctx.dataset.borderColor; }
                }
            },
            scales: {
                y: {
                    beginAtZero: true, min: 0, max: 15,
                    ticks: {
                        stepSize: 1,
                        font: { size: 10 },
                        precision: 0,
                        /* 15 existe estruturalmente mas o rótulo não aparece */
                        callback: function(value) {
                            return value === 15 ? null : value;
                        }
                    },
                    grid: { color: "#f1f5f9" }
                },
                x: { ticks:{ font:{size:10} }, grid:{ display:false } }
            }
        }
    });
    /* Legenda */
    var leg = document.getElementById("ca-legenda");
    if (leg) {
        leg.innerHTML = _caAlunos.map(function(a){
            return "<div class=\'ca-legenda-item\'><span class=\'ca-legenda-dot\' style=\'background:"+a.cor+";\'></span>"+a.nome+"</div>";
        }).join("");
    }
}

/* ── Tabela ─────────────────────────────────────────────────── */
function caRenderizarTabela() {
    var t = document.getElementById("ca-table");
    if (!t) return;
    var cab = "<thead><tr><th>Aluno</th><th>Turma</th>"
        + periodosArr.map(function(p){ return "<th>"+(p.t==="DIAGNÓSTICO"?"Diag.":p.t.split(" ")[0])+"</th>"; }).join("")
        + "<th>Evolução</th><th>Nível atual</th></tr></thead>";
    var corpo = "<tbody>" + _caAlunos.map(function(a){
        var somas = periodosArr.map(function(p){ return calcularSomaAluno(a.turma, p.v, a.nome); });
        var diag  = somas[0]; /* índice 0 = DIAG */

        /* Último período com valor > 0, excluindo DIAG (índice 0) */
        var ultIdx = -1;
        for (var i = somas.length - 1; i >= 1; i--) {
            if (somas[i] > 0) { ultIdx = i; break; }
        }
        /* Se nunca houve lançamento além do diagnóstico, usar o DIAG */
        var ultSoma = ultIdx >= 0 ? somas[ultIdx] : diag;

        var evo    = (diag > 0 && ultIdx >= 0) ? (ultSoma - diag) : 0;
        var evoCls = evo>0?"ca-evo-pos":evo<0?"ca-evo-neg":"ca-evo-zero";
        var evoStr = (diag > 0 && ultIdx >= 0)
            ? (evo>0?"+":"") + evo + " pts"
            : "—";
        var nivel  = calcularNivel(ultSoma);
        return "<tr>"
            +"<td><div class='ca-table-nome'><span class='ca-color-dot' style='background:"+a.cor+";'></span>"+a.nome+"</div></td>"
            +"<td style='color:var(--texto-desabilitado);font-size:11px;'>"+a.turma+"</td>"
            +somas.map(function(s){ return "<td style='font-weight:600;'>"+(s>0?s:"—")+"</td>"; }).join("")
            +"<td><span class='"+evoCls+"'>"+evoStr+"</span></td>"
            +"<td><span class='nivel-badge nivel-"+nivel.cls+"' style='font-size:10px;padding:2px 8px;'>"+nivel.txt+"</span></td>"
            +"</tr>";
    }).join("") + "</tbody>";
    t.innerHTML = cab + corpo;
}

/* ── Upload de foto ─────────────────────────────────────────── */
var _caFotoArquivo = null;

function caPreviewFoto(input) {
    var file = input.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
        mostrarModalAviso("Arquivo muito grande", "A foto deve ter no máximo 2 MB.");
        input.value = "";
        return;
    }
    var ext = file.name.split(".").pop().toLowerCase();
    if (!["jpg","jpeg","png","webp"].includes(ext)) {
        mostrarModalAviso("Formato inválido", "Aceitos: JPG, JPEG, PNG, WEBP.");
        input.value = "";
        return;
    }
    _caFotoArquivo = file;
    window._caFotoArquivoGlobal = file;
    var reader = new FileReader();
    reader.onload = function(e) {
        var prev = document.getElementById("ca-foto-preview");
        if (prev) {
            prev.innerHTML = "<img src=\'"+e.target.result+"\' style=\'width:100%;height:100%;object-fit:cover;border-radius:50%;\'>"; 
        }
    };
    reader.readAsDataURL(file);
}

async function salvarNovoAlunoComFoto() {
    var nome = (document.getElementById("ca-novo-aluno-nome").value || "").trim();
    if (!nome) { mostrarModalAviso("Campo obrigatório", "Digite o nome do aluno."); return; }

    var turma  = getTurmaAtual();
    var lista  = getAlunos();
    if (lista.map(normalizarAluno).includes(normalizarAluno(nome))) {
        mostrarModalAviso("Aluno já existe", "\"" + nome + "\" já está cadastrado."); return;
    }

    /* ── Validação do arquivo de foto ── */
    var arquivo = window._caFotoArquivoGlobal || _caFotoArquivo;
    if (arquivo) {
        if (arquivo.size > 2 * 1024 * 1024) {
            mostrarModalAviso("Arquivo muito grande", "A foto deve ter no máximo 2 MB."); return;
        }
        var extChk = arquivo.name.split(".").pop().toLowerCase();
        if (!["jpg","jpeg","png","webp"].includes(extChk)) {
            mostrarModalAviso("Formato inválido", "Aceitos: JPG, JPEG, PNG, WEBP."); return;
        }
    }

    /* ── Upload de foto (se selecionada) ── */
    var fotoUrl = null;
    if (arquivo && window.sbClient && window.sbOnline) {
        try {
            /* Sanitiza o nome: remove acentos e caracteres especiais
               Supabase Storage rejeita paths com caracteres não-ASCII (erro 400) */
            function _sanitizarPath(s) {
                var map = {
                    'á':'a','à':'a','â':'a','ã':'a','ä':'a','å':'a',
                    'é':'e','è':'e','ê':'e','ë':'e',
                    'í':'i','ì':'i','î':'i','ï':'i',
                    'ó':'o','ò':'o','ô':'o','õ':'o','ö':'o',
                    'ú':'u','ù':'u','û':'u','ü':'u',
                    'ý':'y','ÿ':'y','ñ':'n','ç':'c',
                    'Á':'A','À':'A','Â':'A','Ã':'A','Ä':'A',
                    'É':'E','È':'E','Ê':'E','Ë':'E',
                    'Í':'I','Ì':'I','Î':'I','Ï':'I',
                    'Ó':'O','Ò':'O','Ô':'O','Õ':'O','Ö':'O',
                    'Ú':'U','Ù':'U','Û':'U','Ü':'U','Ñ':'N','Ç':'C'
                };
                return s.split('').map(function(c){ return map[c]||c; })
                        .join('').replace(/[^a-zA-Z0-9_\-]/g, '-')
                        .replace(/-+/g, '-').replace(/^-|-$/g, '');
            }
            var ext = arquivo.name.split(".").pop().toLowerCase();
            var nomeSafe = _sanitizarPath(nome);
            var path = "alunos/" + Date.now() + "_" + nomeSafe + "." + ext;
            var up = await window.sbClient.storage.from("fotos").upload(path, arquivo, { upsert: true });
            if (!up.error) {
                var pub = window.sbClient.storage.from("fotos").getPublicUrl(path);
                fotoUrl = pub.data.publicUrl;
            } else {
                console.warn("[Foto] Upload falhou:", up.error.message);
            }
        } catch(e) { console.warn("[Foto] Upload erro:", e.message); }
    }

    /* ── Salva aluno ── */
    lista.push(nome);
    salvarAlunos(lista);

    if (window.sbOnline) {
        var r = await sbAdicionarAluno(nome, turma);

        /* CORREÇÃO 1+2: sbAdicionarAluno retorna null quando a turma não é encontrada
           no Supabase (turma órfã, ano_letivo_id divergente, ou falha de INSERT).
           Nesse caso: reverter o localStorage, mostrar erro claro, não fechar o modal. */
        if (!r) {
            /* Reverte o push no localStorage — aluno não persiste se o banco falhou */
            var listaRevertida = getAlunos();
            var idxRev = listaRevertida.map(normalizarAluno).indexOf(normalizarAluno(nome));
            if (idxRev >= 0) { listaRevertida.splice(idxRev, 1); salvarAlunos(listaRevertida); }

            mostrarModalAviso(
                "Erro ao cadastrar aluno",
                "Não foi possível salvar <strong>" + nome + "</strong> no banco de dados.<br><br>"
                + "Turma <strong>" + turma + "</strong> não foi encontrada no Supabase "
                + "para o ano letivo atual.<br><br>"
                + "Verifique se a turma foi criada corretamente e se o ano letivo está ativo."
            );
            return; /* Mantém o modal aberto para o usuário corrigir */
        }

        if (fotoUrl) {
            await sbAtualizarFotoAluno(r.id, fotoUrl);
        }
    }

    carregar();
    fecharModalAddAlunoFoto();
    mostrarModalAviso("Aluno adicionado", "\"" + nome + "\" foi cadastrado com sucesso.");
}

function fecharModalAddAlunoFoto() {
    var m = document.getElementById("modal-add-aluno-foto");
    if (m) m.classList.remove("visible");
    _caFotoArquivo = null;
    window._caFotoArquivoGlobal = null;
    var prev = document.getElementById("ca-foto-preview");
    if (prev) prev.innerHTML = "<i class=\'fas fa-camera\'></i>";
    var inp = document.getElementById("ca-novo-aluno-nome");
    if (inp) inp.value = "";
    var fi = document.getElementById("ca-foto-input");
    if (fi) fi.value = "";

}
/* ════════════════════════════════════════════════════════════════
   MODAL EDITAR ALUNO — foto + remover
════════════════════════════════════════════════════════════════ */
var _eaFotoArquivo = null;

function eaPreviewFoto(input) {
    var file = input.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
        mostrarModalAviso("Arquivo muito grande", "A foto deve ter no máximo 2 MB.");
        input.value = "";
        return;
    }
    var ext = file.name.split(".").pop().toLowerCase();
    if (!["jpg","jpeg","png","webp"].includes(ext)) {
        mostrarModalAviso("Formato inválido", "Aceitos: JPG, JPEG, PNG, WEBP.");
        input.value = "";
        return;
    }
    _eaFotoArquivo = file;
    window._eaFotoArquivo = file;
    var reader = new FileReader();
    reader.onload = function(e) {
        var prev = document.getElementById("ea-foto-preview");
        if (prev) prev.innerHTML = "<img src='" + e.target.result + "' style='width:100%;height:100%;object-fit:cover;border-radius:50%;'>";
    };
    reader.readAsDataURL(file);
}

function eaRemoverFoto() {
    window._eaFotoArquivo = null;
    _eaFotoArquivo = null;
    var fi = document.getElementById("ea-foto-input");
    if (fi) fi.value = "";
    var prev = document.getElementById("ea-foto-preview");
    if (prev) prev.innerHTML = "<i class='fas fa-user'></i>";
    /* Marca para remoção no banco */
    var m = document.getElementById("modal-editar-aluno");
    if (m) m.dataset.removerFoto = "1";
}

async function eaSalvarFoto() {
    var m = document.getElementById("modal-editar-aluno");
    if (!m) return;
    var nome = m.dataset.nomeAluno;
    if (!nome) return;

    /* Localiza id do aluno no cache */
    var alunoId = null;
    for (var k in _cacheAlunos) {
        if (k.endsWith("|" + nome)) { alunoId = _cacheAlunos[k].id; break; }
    }

    /* Se não achou no cache, busca no banco */
    if (!alunoId && window.sbClient && window.sbOnline) {
        try {
            var ra = await window.sbClient.from("alunos").select("id").eq("nome", nome).maybeSingle();
            if (ra.data) alunoId = ra.data.id;
        } catch(e) {}
    }

    var arquivo = window._eaFotoArquivo || _eaFotoArquivo;
    var removerFoto = m.dataset.removerFoto === "1";

    if (!arquivo && !removerFoto) {
        mostrarModalAviso("Sem alterações", "Nenhuma foto foi selecionada.");
        return;
    }

    if (removerFoto && alunoId && window.sbClient && window.sbOnline) {
        mostrarLoadingSimples("Removendo foto...");
        try {
            await sbAtualizarFotoAluno(alunoId, null);
            /* Atualiza cache */
            for (var k in _cacheAlunos) {
                if (k.endsWith("|" + nome)) { _cacheAlunos[k].foto_url = null; break; }
            }
            delete m.dataset.removerFoto;
        } catch(e) { console.warn("[eaSalvarFoto] remover foto:", e); }
        finally { ocultarLoadingSimples(); }
        fecharModalEditarAluno();
        mostrarModalAviso("Foto removida", "A foto do aluno foi removida.");
        carregar();
        return;
    }

    if (arquivo && window.sbClient && window.sbOnline) {
        mostrarLoadingSimples("Enviando foto...");
        try {
            function _sanitizarPath(s) {
                var map = {'á':'a','à':'a','â':'a','ã':'a','é':'e','è':'e','ê':'e','í':'i','ì':'i','î':'i','ó':'o','ò':'o','ô':'o','õ':'o','ú':'u','ù':'u','û':'u','ç':'c','ñ':'n','Á':'A','À':'A','Â':'A','Ã':'A','É':'E','È':'E','Ê':'E','Í':'I','Ó':'O','Ô':'O','Õ':'O','Ú':'U','Ç':'C'};
                return s.split('').map(function(c){ return map[c]||c; }).join('').replace(/[^a-zA-Z0-9_\-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
            }
            var ext = arquivo.name.split(".").pop().toLowerCase();
            var nomeSafe = _sanitizarPath(nome);
            var path = "alunos/" + Date.now() + "_" + nomeSafe + "." + ext;
            var up = await window.sbClient.storage.from("fotos").upload(path, arquivo, { upsert: true });
            if (up.error) throw up.error;
            var pub = window.sbClient.storage.from("fotos").getPublicUrl(path);
            var fotoUrl = pub.data.publicUrl;
            if (alunoId) {
                await sbAtualizarFotoAluno(alunoId, fotoUrl);
                /* Atualiza cache */
                for (var k in _cacheAlunos) {
                    if (k.endsWith("|" + nome)) { _cacheAlunos[k].foto_url = fotoUrl; break; }
                }
            }
        } catch(e) {
            ocultarLoadingSimples();
            mostrarModalAviso("Erro", "Não foi possível salvar a foto: " + e.message);
            return;
        }
        ocultarLoadingSimples();
        fecharModalEditarAluno();
        mostrarModalAviso("Foto salva", "A foto de \"" + nome + "\" foi atualizada com sucesso.");
        carregar();
    } else if (arquivo && !window.sbOnline) {
        mostrarModalAviso("Sem conexão", "Você está offline. Conecte-se ao Supabase para salvar fotos.");
    }
}

function eaRemoverAluno() {
    var m = document.getElementById("modal-editar-aluno");
    if (!m) return;
    var nome = m.dataset.nomeAluno;
    if (!nome) return;
    fecharModalEditarAluno();
    mostrarModalConfirmacao("Remover aluno", "Deseja remover permanentemente o aluno \"" + nome + "\"? Todos os lançamentos serão apagados.", async function() {
        var turma = getTurmaAtual();
        var nomeN = normalizarAluno(nome);
        salvarAlunos(getAlunos().filter(function(x){ return normalizarAluno(x) !== nomeN; }));
        periodosArr.forEach(function(p) {
            for (var i = 0; i < 7; i++) localStorage.removeItem(chaveNota(normalizarTurma(turma), p.v, nomeN, i));
        });
        if (window.sbOnline) await sbDeletarAluno(nomeN, turma);
        carregar();
        mostrarModalAviso("Aluno removido", "\"" + nome + "\" foi removido com sucesso.");
    });
}
