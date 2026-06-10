/* ════════════════════════════════════════════════════════════════
   app.js v3.0 -- Estado Global, Navegacao, Lancamentos, Modais
   Sem Supabase Auth. Roles: admin | professor | supervisora.
   A.V. Leitura+
════════════════════════════════════════════════════════════════ */

Chart.register(ChartDataLabels);

var colNames = [
    "Reconhece Letras", "Silabas Simples", "Palavras Simples",
    "Frases Simples", "Silabas Complexas", "Palavras e Frases Complexas",
    "Textos com Fluencia"
];
var periodosArr = [
    { v: "DIAG", t: "DIAGNÓSTICO"  },
    { v: "1BIM", t: "1º BIMESTRE"  },
    { v: "2BIM", t: "2º BIMESTRE"  },
    { v: "3BIM", t: "3º BIMESTRE"  },
    { v: "4BIM", t: "4º BIMESTRE"  }
];

var selP = null;
var graficoPrincipal     = null;
var listaEvolExpandida   = false;
var listaApoioExpandida  = false;
var dadosGlobaisEvolucao = [];

/* ════════════════════════════════════════════════════════════════
   ANO LETIVO — estado global (session only, nunca persiste)
════════════════════════════════════════════════════════════════ */
/* Estado em memória — fonte primária de verdade */
window.anoLetivoSelecionado = null; /* {id, ano, ativo, ...} */

/* Retorna o objeto do ano selecionado */
function alGetAnoSelecionado() {
    if (window.anoLetivoSelecionado) return window.anoLetivoSelecionado;
    try {
        var s = sessionStorage.getItem("al_selecionado");
        var obj = s ? JSON.parse(s) : null;
        if (obj) window.anoLetivoSelecionado = obj;
        return obj;
    } catch(e) { return null; }
}
/* Retorna apenas o id do ano selecionado */
function alGetAnoSelecionadoId() {
    var a = alGetAnoSelecionado();
    return a ? a.id : null;
}
/* Retorna true se o ano selecionado é o ano ativo */
function alIsAnoAtivo() {
    var sel   = alGetAnoSelecionado();
    var ativo = getAnoLetivoAtivo ? getAnoLetivoAtivo() : null;
    if (!sel || !ativo) return true; /* sem dado = assume ativo */
    return String(sel.id) === String(ativo.id);
}
/* Retorna true se estamos em modo histórico */
function alIsModoHistorico() { return !alIsAnoAtivo(); }

/* Verifica se o usuário logado PODE editar no contexto atual */
function alPodeEditar() {
    var u = getUsuarioLogado();
    if (!u) return false;
    var role = (u.cargo || u.role || "").toLowerCase();
    /* Admin pode editar em qualquer ano */
    if (role === "administrador" || role === "admin") return true;
    /* Professor e supervisora: só editam no ano ativo */
    return !alIsModoHistorico();
}

/* Troca o ano selecionado e atualiza todo o sistema */
async function alTrocarAnoSelecionado(id) {
    var anos = window._alAnosCache || [];
    var ano  = anos.find(function(a){ return String(a.id) === String(id); });
    if (!ano) return;

    /* Atualiza estado global */
    window.anoLetivoSelecionado = ano;
    sessionStorage.setItem("al_selecionado", JSON.stringify(ano));

    alAplicarModoHistorico();
    alAtualizarBadgeHeader();

    /* Invalida TODOS os caches — evita fantasmas de dados entre anos */
    _cacheTurmas = {};
    _cacheAlunos = {};
    var keysToRemove = [];
    for (var ki = 0; ki < localStorage.length; ki++) {
        var k = localStorage.key(ki);
        if (k && (k.startsWith("alunos_") || k === "turmas_lista" || k.startsWith("turmas_") ||
            /^.+_(DIAG|1BIM|2BIM|3BIM|4BIM)_/.test(k))) {
            keysToRemove.push(k);
        }
    }
    keysToRemove.forEach(function(k) { localStorage.removeItem(k); });
    console.log("[Ano] Cache limpo ao trocar para ano", ano.ano, "— removidas", keysToRemove.length, "chaves");

    /* Recarrega tudo com o novo ano */
    /* Troca de ano usa mostrarLoadingSimples (não é login — sem saudação pessoal,
       sem 10s mínimo, não toca _refCount/_visivel/_usuarioCache/_msgCache) */
    mostrarLoadingSimples("Trocando para " + ano.ano + "...");
    try {
        if (window.sbOnline) {
            await sbSincronizarTudo();
        } else {
            inicializarTurmas();
        }
        carregar();
        if (typeof rotCarregarLista === "function") rotCarregarLista();
    } finally {
        ocultarLoadingSimples(); /* par correto de mostrarLoadingSimples */
    }
}

/* Aplica/remove modo histórico visualmente e no sistema */
function alAplicarModoHistorico() {
    var historico = alIsModoHistorico();
    var sel       = alGetAnoSelecionado();
    document.body.classList.toggle("modo-historico", historico);
    var banner  = document.getElementById("al-banner-historico");
    var anoSpan = document.getElementById("al-banner-ano");
    if (banner)  banner.style.display = historico ? "block" : "none";
    if (anoSpan && sel) anoSpan.textContent = sel.ano || "";
    var badge = document.getElementById("al-historico-badge");
    if (badge) badge.style.display = historico ? "inline-flex" : "none";
    /* Atualiza botões de header */
    var aba = document.querySelector(".nav-item.active");
    var nomeAba = aba ? aba.id.replace("btn-","") : "lancamentos";
    atualizarBotoesHeader(nomeAba);
}

/* Popula o seletor de anos na sidebar */
async function alPopularSeletor() {
    var anos = await sbBuscarAnosLetivos();
    window._alAnosCache = anos || [];
    if (typeof _alAnos !== "undefined") _alAnos = window._alAnosCache;

    var sel = document.getElementById("al-seletor");
    if (!sel) return;
    sel.innerHTML = "";

    if (!anos || anos.length === 0) {
        sel.innerHTML = "<option value=''>Sem anos cadastrados</option>";
        return;
    }

    /* Define o selecionado: prioridade → sessionStorage → ano ativo */
    var salvo = alGetAnoSelecionado();
    var ativo = getAnoLetivoAtivo ? getAnoLetivoAtivo() : null;
    var idParaSelecionar = salvo ? salvo.id : (ativo ? ativo.id : anos[0].id);

    anos.forEach(function(a) {
        var o = document.createElement("option");
        o.value = a.id;
        o.text  = a.ano + (a.ativo ? " ★" : "");
        if (String(a.id) === String(idParaSelecionar)) o.selected = true;
        sel.appendChild(o);
    });

    /* Garante estado global correto */
    var anoSel = anos.find(function(a){ return String(a.id) === String(idParaSelecionar); });
    if (anoSel) {
        window.anoLetivoSelecionado = anoSel;
        sessionStorage.setItem("al_selecionado", JSON.stringify(anoSel));
    }

    alAplicarModoHistorico();
    alAtualizarBadgeHeader();
}

/* ════════════════════════════════════════════════════════════════
   TURMAS
════════════════════════════════════════════════════════════════ */
function getTurmasStorage() {
    var s = localStorage.getItem("turmas_lista");
    var lista = s ? JSON.parse(s) : []; /* fallback vazio — nunca retornar turmas hardcoded */
    /* Garante trim em todos os nomes — evita mismatch de chave */
    return lista.map(function(t) {
        if (typeof t === "object" && t !== null) { t.nome = (t.nome || "").trim(); return t; }
        return String(t).trim();
    });
}
function salvarTurmasStorage(lista) {
    var normalizada = lista.map(function(t) {
        if (typeof t === "object" && t !== null) { t.nome = (t.nome || "").trim(); return t; }
        return String(t).trim();
    });
    localStorage.setItem("turmas_lista", JSON.stringify(normalizada));
}
/* getNomesTurmas — retorna sempre array de strings (compatibilidade) */
function getNomesTurmas() {
    return getTurmasStorage().map(function(t) {
        return (typeof t === "object") ? t.nome : t;
    });
}

/* ────────────────────────────────────────────────────────────
   getTurmasVisiveis() — FILTRO CENTRAL DE TURMAS OCULTAS
   ─────────────────────────────────────────────────────────
   Regra:
     • Admin               → vê tudo (ocultas incluídas)
     • Professor vinculado → vê suas turmas (incluindo ocultas do seu vínculo)
     • Qualquer outro role → NÃO vê turmas com oculta === true

   Uso obrigatório em TODOS os pontos que exibem listas de turmas
   para o usuário: seletor, relatórios, comparar, ranking, rotinas,
   seleção automática inicial.
──────────────────────────────────────────────────────────── */
function getTurmasVisiveis() {
    var todas = getTurmasStorage();
    /* Admin vê tudo */
    if (isAdmin()) return todas;
    /* Para qualquer outro role, filtra ocultas */
    return todas.filter(function(t) {
        return !(typeof t === "object" && t.oculta === true);
    });
}

/* getNomesTurmasVisiveis — versão string de getTurmasVisiveis */
function getNomesTurmasVisiveis() {
    return getTurmasVisiveis().map(function(t) {
        return (typeof t === "object") ? t.nome : t;
    });
}
function inicializarTurmas() {
    var sel = document.getElementById("turmaSelect");
    if (!sel) return;
    var atual = sel.value;
    sel.innerHTML = "";
    /* Usa getTurmasVisiveis: admins veem tudo; outros não veem turmas ocultas */
    getTurmasVisiveis().forEach(function(t) {
        var nome = ((typeof t === "object") ? t.nome : String(t)).trim();
        var o = document.createElement("option");
        o.value = nome;
        o.text  = nome.toUpperCase();
        if (nome === atual) o.selected = true;
        sel.appendChild(o);
    });
    atualizarBadgeTurno();
}

/* Exibe o turno da turma selecionada num elemento auxiliar abaixo do select */
function atualizarBadgeTurno() {
    var badge = document.getElementById("turno-badge");
    if (!badge) return;
    var nomeSel = document.getElementById("turmaSelect")
                    ? document.getElementById("turmaSelect").value : "";
    var turno = "";
    getTurmasVisiveis().forEach(function(t) {
        if (typeof t === "object" && t.nome === nomeSel) turno = t.turno || "";
    });
    badge.textContent = turno;
    badge.style.display = turno ? "block" : "none";
}

/* ════════════════════════════════════════════════════════════════
   HELPERS DE DADOS
════════════════════════════════════════════════════════════════ */
function getTurmaAtual() { return document.getElementById("turmaSelect").value; }
function getPeriodo()     { return selP ? selP.value : "DIAG"; }

/* ════════════════════════════════════════════════════════════════
   NORMALIZAÇÃO CENTRAL — usada por TODO o sistema
   Garante que nomes de turma, aluno e período nunca tenham
   espaços, aspas ou outros caracteres que quebrem chaves do
   localStorage ou atributos HTML onclick.
════════════════════════════════════════════════════════════════ */
function normalizarTurma(s)   { return String(s || "").trim(); }
function normalizarAluno(s)   { return String(s || "").trim(); }
function normalizarPeriodo(s) { return String(s || "").trim().toUpperCase(); }

/* Chave de alunos no localStorage */
function chaveAlunos(turma, periodo) {
    return "alunos_" + normalizarTurma(turma) + "_" + normalizarPeriodo(periodo);
}
/* Chave de nota no localStorage */
function chaveNota(turma, periodo, nome, idx) {
    return normalizarTurma(turma) + "_" + normalizarPeriodo(periodo)
         + "_" + normalizarAluno(nome) + "_" + idx;
}

function getAlunos(p, t) {
    var turma   = normalizarTurma(t || getTurmaAtual());
    var periodo = normalizarPeriodo(p || getPeriodo());
    return JSON.parse(localStorage.getItem(chaveAlunos(turma, periodo))) || [];
}
function salvarAlunos(lista, p, t) {
    var turma   = normalizarTurma(t || getTurmaAtual());
    var periodo = normalizarPeriodo(p || getPeriodo());
    lista.sort(function(a, b) { return a.localeCompare(b, "pt-BR"); });
    localStorage.setItem(chaveAlunos(turma, periodo), JSON.stringify(lista));
}
function calcularSomaAluno(turma, periodo, nome) {
    var s = 0;
    for (var i = 0; i < 7; i++)
        s += parseInt(localStorage.getItem(chaveNota(turma, periodo, nome, i))) || 0;
    return s;
}
function getNotaHabilidade(turma, periodo, nome, idx) {
    var v = localStorage.getItem(chaveNota(turma, periodo, nome, idx));
    return v !== null ? v : "";
}
function calcularNivel(s) {
    if (s <= 2)  return { txt: "Pré-leitor 1",    cls: "pre1"      };
    if (s <= 5)  return { txt: "Pré-leitor 2",    cls: "pre2"      };
    if (s <= 10) return { txt: "Leitor iniciante", cls: "iniciante" };
    if (s <= 13) return { txt: "Leitor avançado",  cls: "avancado"  };
    return             { txt: "Leitor fluente",    cls: "fluente"   };
}
function getTextoRecomendacao(s) {
    if (s <= 1)  return "Trabalhar reconhecimento das letras e seus sons para iniciar o processo de leitura.";
    if (s === 2) return "Reforçar reconhecimento das letras e iniciar leitura de sílabas simples.";
    if (s <= 4)  return "Consolidar leitura de sílabas simples e iniciar leitura de palavras simples.";
    if (s <= 6)  return "Trabalhar leitura de palavras simples e iniciar leitura de frases curtas.";
    if (s <= 8)  return "Desenvolver leitura de frases simples e iniciar trabalho com sílabas complexas.";
    if (s <= 10) return "Trabalhar sílabas complexas e leitura de palavras complexas para desenvolver a leitura.";
    if (s === 11)return "Trabalhar leitura de palavras complexas e pequenos textos para ampliar compreensão.";
    if (s <= 13) return "Trabalhar fluência leitora e leitura de diferentes textos com compreensão.";
    return "Trabalhar interpretação textual, produção escrita e ampliação da compreensão.";
}

/* ════════════════════════════════════════════════════════════════
   SIDEBAR / MOBILE
════════════════════════════════════════════════════════════════ */
function toggleSidebarMobile() {
    document.getElementById("sidebar").classList.toggle("mobile-open");
    document.getElementById("sidebar-overlay").classList.toggle("visible");
}
function fecharSidebarMobile() {
    document.getElementById("sidebar").classList.remove("mobile-open");
    document.getElementById("sidebar-overlay").classList.remove("visible");
}
function detectarMobile() {
    var isMobile = window.innerWidth <= 768;
    var btn = document.getElementById("mobile-menu-btn");
    if (btn) btn.style.display = isMobile ? "flex" : "none";
}
function toggleSidebar() {
    if (window.innerWidth <= 768) { toggleSidebarMobile(); return; }
    var sb = document.getElementById("sidebar");
    sb.classList.toggle("collapsed");
    document.getElementById("toggleIcon").className =
        sb.classList.contains("collapsed") ? "fas fa-chevron-right" : "fas fa-bars";
}

/* ════════════════════════════════════════════════════════════════
   NAVEGACAO
════════════════════════════════════════════════════════════════ */
function atualizarBotoesHeader(aba) {
    var u        = getUsuarioLogado();
    var role     = u ? ((u.role || u.cargo || "").toLowerCase().trim()) : "";
    var historico = alIsModoHistorico();
    var ehSuperOuDiretor = isSupervisor ? isSupervisor() : (role === "supervisora" || role === "supervisor" || role === "diretor" || role === "diretora");
    /* Apoio: oculta botões de edição (os selects já ficam soLeitura via carregar()) */
    var ehApoio  = typeof alEhApoioDaTurmaAtual === "function" && alEhApoioDaTurmaAtual();
    var mostrar  = aba === "lancamentos" && !ehSuperOuDiretor && !historico && !ehApoio;
    var bi = document.getElementById("btn-header-import");
    var bn = document.getElementById("btn-header-novo");
    if (bi) bi.classList.toggle("hidden-btn", !mostrar);
    if (bn) bn.classList.toggle("hidden-btn", !mostrar);
}
function atualizarRelatorioSeAberto() {
    if (document.getElementById("aba-relatorio").classList.contains("active"))
        abrirRelatorioModal();
}
function atualizarTurma() {
    var tp = document.getElementById("turmaPerfil");
    if (tp) tp.innerText = getTurmaAtual();
    atualizarBadgeTurno(); /* atualiza turno abaixo do select */
    carregar();
    atualizarRelatorioSeAberto();
}
function trocarAba(nome, event) {
    /* Registra atividade real: navegação interna conta como interação */
    if (typeof _telRegistrarAtividade === "function") _telRegistrarAtividade();
    /* Bloquear configuracoes para nao-admins */
    if (nome === "configuracoes" && !isAdmin()) {
        mostrarModalAviso("Sem permissao", "Apenas administradores acessam as configuracoes.");
        return;
    }

    document.querySelectorAll(".content-body").forEach(function(el) { el.classList.remove("active"); });
    document.querySelectorAll(".nav-item").forEach(function(el) { el.classList.remove("active"); });

    var mapa = {
        lancamentos:    "aba-lancamentos",
        relatorio:      "aba-relatorio",
        comparar:       "aba-comparar",
        compararalunos: "aba-compararalunos",
        atividades:     "aba-atividades",
        configuracoes:  "aba-configuracoes",
        rotinas:        "aba-rotinas"
    };
    var target = document.getElementById(mapa[nome]);
    if (target) target.classList.add("active");
    if (event && event.currentTarget) event.currentTarget.classList.add("active");

    atualizarBotoesHeader(nome);
    /* Garante que loading órfão de troca rápida de aba seja cancelado */
    ocultarLoadingForcar();

    if (nome === "relatorio") {
        mostrarLoadingLocal("aba-relatorio");
        setTimeout(function() {
            try { abrirRelatorioModal(); } finally { ocultarLoadingLocal("aba-relatorio"); }
        }, 40);
    }
    if (nome === "comparar") {
        popularCheckboxesTurmas();
        preencherPeriodosComparar();
        mostrarLoadingLocal("aba-comparar");
        setTimeout(function() {
            try { atualizarComparacao(); } finally { ocultarLoadingLocal("aba-comparar"); }
        }, 80);
    }
    if (nome === "compararalunos") {
        mostrarLoadingLocal("aba-compararalunos");
        setTimeout(function() {
            try { caInicializar(); } finally { ocultarLoadingLocal("aba-compararalunos"); }
        }, 80);
    }
    if (nome === "lancamentos")   carregar();
    if (nome === "atividades")    setTimeout(atvRenderizar, 50);
    if (nome === "configuracoes") setTimeout(cfgIniciar, 50);
    if (nome === "rotinas")       setTimeout(rotIniciar, 50);
    if (window.innerWidth <= 768) fecharSidebarMobile();
}

/* ════════════════════════════════════════════════════════════════
   ABA LANCAMENTOS
════════════════════════════════════════════════════════════════ */
function carregar() {
    if (!selP) return;
    var atual    = getPeriodo();
    var turma    = getTurmaAtual();
    var alunos   = getAlunos(atual, turma);
    var anterior = selP.selectedIndex > 0 ? periodosArr[selP.selectedIndex - 1].v : null;
    /* soLeitura: supervisor/diretor SEM turma vinculada, OU professor com vínculo Apoio */
    var ehApoio   = typeof alEhApoioDaTurmaAtual === "function" && alEhApoioDaTurmaAtual();
    var soLeitura = window._modoSomenteLeitura || ehApoio;

    document.getElementById("txt-periodo").innerText = selP.options[selP.selectedIndex].text;

    var html = "", totaisCol = Array(7).fill(0), somasGerais = [];
    var contNiveis = { "Pré-leitor 1":0,"Pré-leitor 2":0,"Leitor iniciante":0,"Leitor avançado":0,"Leitor fluente":0 };
    dadosGlobaisEvolucao = [];

    alunos.forEach(function(nome) {
        var sa = calcularSomaAluno(turma, atual, nome);
        for (var i = 0; i < 7; i++)
            totaisCol[i] += parseInt(localStorage.getItem(turma+"_"+atual+"_"+nome+"_"+i)) || 0;
        if (anterior)
            dadosGlobaisEvolucao.push({ nome: nome, diff: sa - calcularSomaAluno(turma, anterior, nome) });
        somasGerais.push(sa);
        var nv = calcularNivel(sa);
        contNiveis[nv.txt]++;

        html += "<tr><td class=\"td-nome\">" + nome + "</td>";
        for (var j = 0; j < 7; j++) {
            var v   = localStorage.getItem(turma+"_"+atual+"_"+nome+"_"+j) || "";
            var cor = v==="2"?"status-sim":v==="1"?"status-parcial":v==="0"?"status-nao":"";
            if (soLeitura) {
                /* Supervisora: exibir valor sem select editavel */
                var txt = v==="2"?"SIM":v==="1"?"PARCIAL":v==="0"?"NAO":"";
                html += "<td><span class=\"select-hab " + cor + "\" style=\"display:inline-block;width:90%;text-align:center;padding:2px;border-radius:4px;font-size:10px;font-weight:700;\">" + txt + "</span></td>";
            } else {
                html += "<td><select class=\"select-hab "+cor+"\" onchange=\"salvarNota('"+nome+"',"+j+",this.value)\">"
                     + "<option value=\"\"></option>"
                     + "<option value=\"2\""+(v==="2"?" selected":"")+">SIM</option>"
                     + "<option value=\"1\""+(v==="1"?" selected":"")+">PARCIAL</option>"
                     + "<option value=\"0\""+(v==="0"?" selected":"")+">NAO</option>"
                     + "</select></td>";
            }
        }
        var acaoBtn = soLeitura ? "" :
"<i class=\"fas fa-pencil-alt\" style=\"color:var(--cor-primaria);cursor:pointer;font-size:15px;\" title=\"Editar aluno\" onclick=\"abrirModalEditarAluno('" + nome + "')\"></i>";
        html += "<td><b>"+sa+"</b></td>"
             + "<td><span class=\"badge-nivel "+nv.cls+"\">"+nv.txt+"</span></td>"
             + "<td>" + acaoBtn + "</td></tr>";
    });

    document.getElementById("tabela-body").innerHTML = html ||
        "<tr><td colspan=\"11\" style=\"text-align:center;padding:20px;color:#94a3b8;\">Nenhum aluno cadastrado.</td></tr>";

    atualizarCardsTopo(alunos.length, somasGerais, totaisCol);
    atualizarRodape(totaisCol, alunos.length);
    atualizarGraficoPrincipal(contNiveis);
    processarEvolucao();
}

function atualizarCardsTopo(tot, somas, totaisC) {
    var media = tot ? (somas.reduce(function(a,b){return a+b;},0)/tot).toFixed(1) : 0;
    var di    = totaisC.indexOf(Math.max.apply(null, totaisC));
    var cfg   = [
        {i:"fas fa-users",        bg:"#eff6ff",col:"#3b82f6",val:tot,                            desc:"Total de Alunos",sub:"Ativos"},
        {i:"fas fa-chart-line",   bg:"#f0fdf4",col:"#22c55e",val:String(media).replace(".",","), desc:"Media Turma",   sub:"Max 14 pts"},
        {i:"fas fa-star",         bg:"#faf5ff",col:"#a855f7",val:somas.length?Math.max.apply(null,somas):0,desc:"Maior Nota",sub:"Pontos"},
        {i:"fas fa-bullseye",     bg:"#fff7ed",col:"#f97316",val:somas.length?Math.min.apply(null,somas):0,desc:"Menor Nota",sub:"Pontos"},
        {i:"fas fa-check-circle", bg:"#f0f9ff",col:"#0ea5e9",val:tot>0?colNames[di]:"-",         desc:"Destaque",     sub:tot?Math.round((totaisC[di]/(tot*2))*100)+"% da turma":""}
    ];
    document.getElementById("cards-resumo").innerHTML = cfg.map(function(x) {
        return "<div class=\"card-resumo\"><div class=\"card-icon\" style=\"background:"+x.bg+";color:"+x.col+"\"><i class=\""+x.i+"\"></i></div>"
             + "<div class=\"resumo-info\"><span class=\"val-desc\">"+x.desc+"</span>"
             + "<span class=\"val-num\">"+x.val+"</span><span class=\"val-sub\">"+x.sub+"</span></div></div>";
    }).join("");
}

function atualizarRodape(totaisAtual, n) {
    var anterior = selP.selectedIndex > 0 ? periodosArr[selP.selectedIndex-1].v : null;
    var turma    = getTurmaAtual();
    var totaisAnt = Array(7).fill(0);
    if (anterior) {
        var als = getAlunos(anterior, turma);
        if (als.length > 0) {
            als.forEach(function(nome) {
                for (var i=0;i<7;i++) totaisAnt[i]+=parseInt(localStorage.getItem(turma+"_"+anterior+"_"+nome+"_"+i))||0;
            });
            totaisAnt = totaisAnt.map(function(v){return Math.round((v/(als.length*2))*100);});
        }
    }
    var h = "<td style=\"text-align:left;padding-left:15px;font-size:10px;font-weight:700;\">MEDIA TURMA</td>";
    totaisAtual.forEach(function(v,i) {
        var pct   = n ? Math.round((v/(n*2))*100) : 0;
        var delta = "";
        if (anterior && selP.selectedIndex > 0) {
            var diff = pct - totaisAnt[i];
            var cls  = diff>0?"delta-up":diff<0?"delta-down":"delta-neu";
            var seta = diff>0?"up":diff<0?"down":"";
            delta = "<span class=\""+cls+"\">"+(seta==="up"?"":seta==="down"?"":"")+Math.abs(diff)+"%</span>";
        }
        h += "<td><div class=\"td-pct\"><span class=\"pct-main\">"+pct+"%</span>"+delta+"</div></td>";
    });
    document.getElementById("tabela-footer").innerHTML = h + "<td colspan=\"3\"></td>";
}

function atualizarGraficoPrincipal(c) {
    var cont = document.getElementById("grafico-niveis-barras");
    if (!cont) return;

    var niveis = [
        { key: "Pré-leitor 1",    cls: "pre1",      cor: "#ef4444", emoji: "🌱" },
        { key: "Pré-leitor 2",    cls: "pre2",      cor: "#fb923c", emoji: "🌿" },
        { key: "Leitor iniciante",cls: "iniciante", cor: "#eab308", emoji: "🌳" },
        { key: "Leitor avançado", cls: "avancado",  cor: "#16a34a", emoji: "🍎" },
        { key: "Leitor fluente",  cls: "fluente",   cor: "#2563eb", emoji: "⭐" }
    ];

    var total = Object.values(c).reduce(function(a,b){ return a+b; }, 0);

    if (total === 0) {
        cont.innerHTML = "<p style='font-size:11px;color:var(--texto-desabilitado);text-align:center;padding:20px 0;'>Nenhum aluno cadastrado</p>";
        return;
    }

    var html = "";
    niveis.forEach(function(n) {
        var qtd = c[n.key] || 0;
        var pct = total > 0 ? Math.round((qtd / total) * 100) : 0;
        if (qtd === 0) return; /* oculta níveis zerados */

        html += '<div style="display:flex;align-items:center;gap:8px;">'
              /* ícone + label */
              + '<div style="display:flex;align-items:center;gap:5px;min-width:130px;">'
              + '<span style="width:24px;height:24px;border-radius:6px;background:' + n.cor + '1a;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:13px;line-height:1;">'
              + n.emoji + '</span>'
              + '<span style="font-size:11px;font-weight:600;color:var(--texto-primario);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + n.key + '</span>'
              + '</div>'
              /* barra de progresso */
              + '<div style="flex:1;height:18px;background:var(--bg-secundario);border-radius:20px;overflow:hidden;position:relative;">'
              + '<div style="height:100%;width:' + pct + '%;background:' + n.cor + ';border-radius:20px;transition:width .6s cubic-bezier(.4,0,.2,1);min-width:' + (pct>0?'18':'0') + 'px;">'
              + '</div>'
              + '</div>'
              /* porcentagem + contagem */
              + '<div style="min-width:52px;text-align:right;line-height:1.2;">'
              + '<span style="font-size:13px;font-weight:800;color:' + n.cor + ';">' + pct + '%</span>'
              + '<span style="font-size:10px;color:var(--texto-desabilitado);display:block;">' + qtd + ' aluno' + (qtd>1?'s':'') + '</span>'
              + '</div>'
              + '</div>';
    });

    cont.innerHTML = html;
}

function processarEvolucao() {
    var lMais  = document.getElementById("lista-mais-evolucao");
    var lMenos = document.getElementById("lista-menos-evolucao");
    var cEvol  = document.getElementById("container-ver-mais-evol");
    var cApoio = document.getElementById("container-ver-mais-apoio");
    if (!lMais) return;
    if (selP.selectedIndex === 0) {
        var msg = "<p style=\"font-size:10px;color:#94a3b8;text-align:center;margin-top:40px;\">Sem dados anteriores</p>";
        lMais.innerHTML = lMenos.innerHTML = msg;
        return;
    }
    var turmaA = getTurmaAtual(), periodoA = getPeriodo();
    var evol  = dadosGlobaisEvolucao.filter(function(a){return a.diff>0;}).sort(function(a,b){return b.diff-a.diff;});
    var apoio = dadosGlobaisEvolucao.filter(function(a){
        return a.diff<0 || (a.diff===0 && calcularSomaAluno(turmaA,periodoA,a.nome)<10);
    }).sort(function(a,b){return a.diff-b.diff;});
    lMais.innerHTML  = renderSubLista(listaEvolExpandida  ? evol  : evol.slice(0,5));
    lMenos.innerHTML = renderSubLista(listaApoioExpandida ? apoio : apoio.slice(0,5));
    cEvol.innerHTML  = evol.length>5
        ? "<button class=\"btn-toggle-lista\" onclick=\"listaEvolExpandida=!listaEvolExpandida;processarEvolucao()\"><i class=\"fas fa-chevron-"+(listaEvolExpandida?"up":"down")+"\"></i> ("+(listaEvolExpandida?"Recolher":"+"+(evol.length-5))+")</button>" : "";
    cApoio.innerHTML = apoio.length>5
        ? "<button class=\"btn-toggle-lista\" onclick=\"listaApoioExpandida=!listaApoioExpandida;processarEvolucao()\"><i class=\"fas fa-chevron-"+(listaApoioExpandida?"up":"down")+"\"></i> ("+(listaApoioExpandida?"Recolher":"+"+(apoio.length-5))+")</button>" : "";
}

function renderSubLista(lista) {
    return lista.map(function(a) {
        var cls=a.diff>0?"v-pos":"v-neg", sinal=a.diff>0?"+":"";
        return "<li class=\"item-evolucao\"><div class=\"evol-info\"><div class=\"evol-avatar\">"+a.nome[0]+"</div>"
             + "<span class=\"evol-nome\">"+a.nome+"</span></div>"
             + "<span class=\""+cls+"\">"+sinal+a.diff+" pts</span></li>";
    }).join("");
}

/* ════════════════════════════════════════════════════════════════
   SALVAR NOTA -- verifica permissao de supervisora
════════════════════════════════════════════════════════════════ */
function salvarNota(nome, idx, valor) {
    if (!verificarPermissaoEdicao()) return;

    var turma   = normalizarTurma(getTurmaAtual());
    var periodo = normalizarPeriodo(getPeriodo());
    nome        = normalizarAluno(nome);

    if (valor === "") localStorage.removeItem(chaveNota(turma, periodo, nome, idx));
    else              localStorage.setItem(chaveNota(turma, periodo, nome, idx), valor);

    if (window.sbOnline) {
        sbSalvarNota(nome, turma, periodo, idx, valor).catch(function(e) {
            console.warn("[salvarNota] Banco:", e);
        });
    }
    carregar();
}

/* ════════════════════════════════════════════════════════════════
   MODAIS
════════════════════════════════════════════════════════════════ */
function mostrarModalConfirmacao(titulo, msg, cb) {
    document.getElementById("modal-titulo").innerText = titulo;
    document.getElementById("modal-desc").innerHTML   = msg;
    document.getElementById("modal-input").style.display = "none";
    document.getElementById("modal").style.display = "flex";
    document.getElementById("btn-modal-confirm").onclick = function() { fecharModal(); if(cb) cb(); };
    document.getElementById("btn-modal-cancel").style.display = "inline-block";
}
function mostrarModalAviso(titulo, msg) {
    document.getElementById("modal-titulo").innerText = titulo;
    document.getElementById("modal-desc").innerHTML   = msg;
    document.getElementById("modal-input").style.display = "none";
    document.getElementById("modal").style.display = "flex";
    document.getElementById("btn-modal-confirm").innerText = "OK";
    document.getElementById("btn-modal-confirm").onclick   = fecharModal;
    document.getElementById("btn-modal-cancel").style.display = "none";
}
function fecharModal() {
    document.getElementById("modal").style.display = "none";
    document.getElementById("btn-modal-confirm").innerText = "Confirmar";
    document.getElementById("btn-modal-cancel").style.display = "inline-block";
    document.getElementById("modal-input").value = "";
}
/* Modal personalizado com HTML livre — para o modal de copiar estrutura */
function mostrarModalPersonalizado(titulo, htmlConteudo) {
    var m = document.getElementById("modal");
    document.getElementById("modal-titulo").innerText = titulo;
    document.getElementById("modal-desc").innerHTML   = htmlConteudo;
    document.getElementById("modal-input").style.display   = "none";
    document.getElementById("btn-modal-confirm").style.display = "none";
    document.getElementById("btn-modal-cancel").style.display  = "none";
    m.style.display = "flex";
}
function fecharModalPersonalizado() {
    var m = document.getElementById("modal");
    m.style.display = "none";
    document.getElementById("btn-modal-confirm").style.display = "inline-block";
    document.getElementById("btn-modal-confirm").innerText = "Confirmar";
    document.getElementById("btn-modal-cancel").style.display  = "inline-block";
    document.getElementById("modal-desc").innerHTML = "";
}

function abrirModalAdd() {
    if (!verificarPermissaoEdicao()) return;
    var m = document.getElementById("modal-add-aluno-foto");
    if (!m) return;
    /* Limpa o modal antes de abrir */
    var inp = document.getElementById("ca-novo-aluno-nome");
    if (inp) inp.value = "";
    var prev = document.getElementById("ca-foto-preview");
    if (prev) prev.innerHTML = "<i class='fas fa-camera'></i>";
    var fi = document.getElementById("ca-foto-input");
    if (fi) fi.value = "";
    window._caFotoArquivoGlobal = null;
    m.classList.add("visible");
    setTimeout(function() {
        var inp2 = document.getElementById("ca-novo-aluno-nome");
        if (inp2) inp2.focus();
    }, 50);
}


function abrirModalDel(nome) {
    if (!verificarPermissaoEdicao()) return;
    document.getElementById("modal-titulo").innerText = "Remover aluno?";
    document.getElementById("modal-desc").innerText   = "Remover \""+nome+"\"?";
    document.getElementById("modal-input").style.display = "none";
    document.getElementById("modal").style.display = "flex";
    document.getElementById("btn-modal-cancel").style.display = "inline-block";
    document.getElementById("btn-modal-confirm").onclick = async function() {
        var turma = normalizarTurma(getTurmaAtual());
        var nomeN = normalizarAluno(nome);
        salvarAlunos(getAlunos().filter(function(x){ return normalizarAluno(x) !== nomeN; }));
        periodosArr.forEach(function(p) {
            for (var i = 0; i < 7; i++) localStorage.removeItem(chaveNota(turma, p.v, nomeN, i));
        });
        if (window.sbOnline) await sbDeletarAluno(nomeN, turma);
        carregar();
        fecharModal();
    };
}

function abrirModalEditarAluno(nome) {
    if (!verificarPermissaoEdicao()) return;
    var m = document.getElementById("modal-editar-aluno");
    if (!m) return;

    /* Preenche nome (somente exibição) */
    var spanNome = document.getElementById("ea-nome-aluno");
    if (spanNome) spanNome.textContent = nome;

    /* Salva nome no dataset do modal para uso posterior */
    m.dataset.nomeAluno = nome;

    /* Reseta foto preview */
    var prev = document.getElementById("ea-foto-preview");
    if (prev) prev.innerHTML = "<i class='fas fa-user'></i>";
    var fi = document.getElementById("ea-foto-input");
    if (fi) fi.value = "";
    window._eaFotoArquivo = null;

    /* Tenta carregar foto do cache */
    var turma = getTurmaAtual();
    var turmaId = null;
    /* Busca foto via cache _cacheAlunos se disponível */
    for (var k in _cacheAlunos) {
        if (k.endsWith("|" + nome)) {
            var cached = _cacheAlunos[k];
            if (cached && cached.foto_url) {
                if (prev) prev.innerHTML = "<img src='" + cached.foto_url + "' style='width:100%;height:100%;object-fit:cover;border-radius:50%;'>";
            }
            break;
        }
    }

    /* Abre modal */
    m.classList.add("visible");
}

function fecharModalEditarAluno() {
    var m = document.getElementById("modal-editar-aluno");
    if (m) m.classList.remove("visible");
    window._eaFotoArquivo = null;
}

function abrirModalImport() {
    if (!verificarPermissaoEdicao()) return;
    var idx = periodosArr.findIndex(function(p){return p.v===getPeriodo();});
    if (idx<=0) { mostrarModalAviso("Importar","Nao ha periodo anterior."); return; }
    var pAnt=periodosArr[idx-1].v, alsAnt=getAlunos(pAnt), alsAt=getAlunos();
    if (!alsAnt.length) { mostrarModalAviso("Importar","Sem alunos no periodo anterior."); return; }
    var novos=alsAnt.filter(function(a){return !alsAt.includes(a);});
    if (!novos.length) { mostrarModalAviso("Importar","Todos ja cadastrados."); return; }
    mostrarModalConfirmacao("Importar Alunos","Importar "+novos.length+" aluno(s)?", async function() {
        var turma=getTurmaAtual(), periodo=getPeriodo();
        salvarAlunos([...new Set([...alsAt,...novos])]);
        if (window.sbOnline) {
            mostrarLoadingSimples("Importando " + novos.length + " aluno(s)...");
            try {
                for (var i=0;i<novos.length;i++) await sbAdicionarAluno(novos[i], turma);
            } finally {
                ocultarLoadingSimples();
            }
        }
        carregar();
        mostrarModalAviso("Concluido", novos.length+" aluno(s) importado(s).");
    });
}

function removerTodosAlunosPeriodo() {
    if (!verificarPermissaoEdicao()) return;
    var alunos  = getAlunos();
    var periodo = normalizarPeriodo(getPeriodo());
    var turma   = normalizarTurma(getTurmaAtual());
    if (!alunos.length) { mostrarModalAviso("Remover","Sem alunos neste periodo."); return; }
    mostrarModalConfirmacao("Remover Todos","Remover "+alunos.length+" aluno(s)?", async function() {
        localStorage.removeItem(chaveAlunos(turma, periodo));
        alunos.forEach(function(nome) {
            nome = normalizarAluno(nome);
            for (var i = 0; i < 7; i++) localStorage.removeItem(chaveNota(turma, periodo, nome, i));
        });
        if (window.sbOnline) await sbDeletarLancamentosPeriodo(turma, periodo);
        carregar();
        mostrarModalAviso("Concluido","Todos os alunos removidos do periodo.");
    });
}

/* ════════════════════════════════════════════════════════════════
   SYS CONFIG
════════════════════════════════════════════════════════════════ */
var SYS_KEY = "av_sys_config";
function sysGetConfig() {
    try { return JSON.parse(localStorage.getItem(SYS_KEY)) || {}; } catch(e) { return {}; }
}
/* Helper global — usado em impressão de rotinas, relatórios, etc. */
/* getNomeEscola — implementação única e centralizada.
   rotinas.js tinha uma cópia que lia localStorage diretamente — foi removida.
   Todos os módulos usam esta. */
function getNomeEscola() {
    var cfg = sysGetConfig();
    return cfg.escola || cfg.titulo || "A.V. Leitura+";
}
function sysAplicar(cfg) {
    var titulo = cfg.titulo || "A.V. Leitura+";
    var sub    = cfg.sub    || "";
    var escola = cfg.escola || "";

    /* ── Cabeçalho ── */
    var h1 = document.querySelector(".logo-text h1");
    var ps = document.querySelectorAll(".logo-text p");
    if (h1)    h1.innerText    = titulo;
    if (ps[0]) ps[0].innerText = sub;
    if (ps[1]) ps[1].innerText = escola;
    /* Fix Bug 2: terceiro <p> do cabeçalho (id="logo-escola") nunca era atualizado */
    var logoEscola = document.getElementById("logo-escola");
    if (logoEscola) logoEscola.innerText = escola;

    /* ── Tela de login (Fix Bug 1: campos eram hardcoded no HTML) ── */
    var loginTitulo = document.getElementById("login-titulo");
    var loginSub    = document.getElementById("login-sub");
    var loginEscola = document.getElementById("login-escola");
    if (loginTitulo) loginTitulo.innerText = titulo;
    if (loginSub)    loginSub.innerText    = sub;
    if (loginEscola) loginEscola.innerText = escola;

    /* ── Aba do browser ── */
    document.title = titulo + " - Sistema";

    /* ── Rodapé ── */
    var sfMun = document.getElementById("sf-municipio-txt");
    var sfAno = document.getElementById("sf-ano-txt");
    if (sfMun) sfMun.innerText = cfg.municipio || "";
    if (sfAno) sfAno.innerText = cfg.ano       || "";
}
function sysCarregarDados() {
    var cfg=sysGetConfig();
    var map={"sys-titulo":cfg.titulo,"sys-sub":cfg.sub,"sys-escola":cfg.escola,"sys-municipio":cfg.municipio,"sys-ano":cfg.ano};
    for (var id in map) { var el=document.getElementById(id); if(el) el.value=map[id]||""; }
    sysAtualizarPrevia();
}
function sysAtualizarPrevia() {
    var g=function(id){var el=document.getElementById(id);return el?el.value:"";};
    var spbT=document.getElementById("spb-titulo"), spbS=document.getElementById("spb-sub"), spbC=document.getElementById("spb-school");
    if (spbT) spbT.innerText = g("sys-titulo")||"A.V. Leitura+";
    if (spbS) spbS.innerText = g("sys-sub")   ||"Sistema de Acompanhamento de Leitura";
    if (spbC) spbC.innerText = g("sys-escola")||"";
}
async function sysSalvar() {
    if (!isAdmin()) { mostrarModalAviso("Sem permissao","Apenas admins alteram configuracoes."); return; }
    var g = function(id) { var el = document.getElementById(id); return el ? el.value : ""; };

    /* Fix Bug 3: faz MERGE com a config existente para não apagar aviso_meta
       (nem qualquer outra chave adicionada no futuro).
       Só sobrescreve os 5 campos que este formulário gerencia. */
    var cfgAtual = sysGetConfig();
    var cfg = Object.assign({}, cfgAtual, {
        titulo:    g("sys-titulo")    || "A.V. Leitura+",
        sub:       g("sys-sub")       || "Sistema de Acompanhamento de Leitura",
        escola:    g("sys-escola")    || "",
        municipio: g("sys-municipio") || "",
        ano:       g("sys-ano")       || "2026"
    });

    localStorage.setItem(SYS_KEY, JSON.stringify(cfg));
    sysAplicar(cfg);
    if (window.sbOnline) {
        mostrarLoadingSimples("Salvando configurações...");
        try { await sbSalvarSysConfig(cfg); } finally { ocultarLoadingSimples(); }
    }
    mostrarModalAviso("Salvo!","Configuracoes aplicadas.");
}
async function sysCarregarDoSupabase() {
    sysAplicar(sysGetConfig());
    if (window.sbOnline) {
        var cfgR = await sbCarregarSysConfig();
        if (cfgR) {
            /* Merge: Supabase é autoritativo para os campos do sistema,
               mas preserva chaves locais (ex: aviso_meta) que podem existir
               no localStorage mas ainda não terem sido sincronizadas. */
            var cfgLocal  = sysGetConfig();
            var cfgMerged = Object.assign({}, cfgLocal, cfgR);
            localStorage.setItem(SYS_KEY, JSON.stringify(cfgMerged));
            sysAplicar(cfgMerged);
        }
    }
    /* Aplica permissões carregadas do Supabase */
    permAplicar(permGetConfig());
}

/* ════════════════════════════════════════════════════════════════
   PERMISSÕES GLOBAIS DO SISTEMA
   ────────────────────────────────────────────────────────────────
   Armazenadas em sys_config (Supabase, id=1) sob a chave "permissoes".
   Sempre carregadas via sysCarregarDoSupabase() na inicialização.

   Estrutura atual:
   config.permissoes = {
       visualizar_rotinas_gestao: boolean   // Diretores/Supervisores veem rotinas de professores
   }

   Para adicionar nova permissão no futuro:
   1. Adicionar o campo aqui com valor padrão
   2. Adicionar checkbox em cfg-sec-permissoes (index.html)
   3. Implementar a verificação no módulo correspondente
   4. Referenciar via permGetPerm("nome_da_permissao")
════════════════════════════════════════════════════════════════ */

/* Lê o bloco de permissões do sys_config */
function permGetConfig() {
    var cfg = sysGetConfig();
    return cfg.permissoes || {};
}

/* Lê uma permissão individual com valor padrão */
function permGetPerm(chave, padrao) {
    var perms = permGetConfig();
    return (chave in perms) ? !!perms[chave] : (padrao !== undefined ? padrao : false);
}

/* Preenche o formulário da seção Permissões com os valores atuais */
function permCarregar() {
    var perms = permGetConfig();
    var elRotGestao = document.getElementById("perm-rotinas-gestao");
    /* Padrão: true (comportamento atual do sistema — gestão vê tudo) */
    if (elRotGestao) elRotGestao.checked = (perms.visualizar_rotinas_gestao !== false);
    var elDarkMode = document.getElementById("perm-dark-mode");
    if (elDarkMode) elDarkMode.checked = !!perms.dark_mode_habilitado;
}

/* Aplica permissões no DOM / variáveis globais (chamado ao carregar e ao salvar) */
function permAplicar(perms) {
    /* Expõe as permissões globalmente para que outros módulos consultem */
    window._permissoes = Object.assign({
        visualizar_rotinas_gestao: true,  /* padrão: ativado */
        dark_mode_habilitado:       false  /* padrão: desativado */
    }, perms);

    /* Aplica visibilidade do botão dark mode */
    var btnDark = document.getElementById("btn-darkmode");
    if (btnDark) {
        var ehAdmin = (typeof isAdmin === "function") ? isAdmin() : false;
        var temPerm = !!window._permissoes.dark_mode_habilitado;
        btnDark.style.display = (ehAdmin || temPerm) ? "" : "none";
    }
}

/* Salva permissões no sys_config (merge — não apaga outras chaves) */
async function permSalvar() {
    if (!isAdmin()) { mostrarModalAviso("Sem permissão", "Apenas administradores podem alterar permissões."); return; }

    var elRotGestao = document.getElementById("perm-rotinas-gestao");
    var elDarkMode = document.getElementById("perm-dark-mode");
    var perms = {
        visualizar_rotinas_gestao: elRotGestao ? elRotGestao.checked : true,
        dark_mode_habilitado:      elDarkMode  ? elDarkMode.checked  : false
    };

    /* Merge com sys_config existente — preserva titulo, escola, aviso_meta etc. */
    var cfgAtual = sysGetConfig();
    var cfgNova  = Object.assign({}, cfgAtual, { permissoes: perms });
    localStorage.setItem(SYS_KEY, JSON.stringify(cfgNova));
    permAplicar(perms);

    if (window.sbOnline) {
        mostrarLoadingSimples("Salvando permissões...");
        try { await sbSalvarSysConfig(cfgNova); }
        finally { ocultarLoadingSimples(); }
    }
    mostrarModalAviso("Salvo!", "Permissões aplicadas com sucesso.");
}

/* ════════════════════════════════════════════════════════════════
   INICIALIZACAO
════════════════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════════════════
   SELEÇÃO AUTOMÁTICA DE PADRÕES AO INICIAR
   — Aba: Lançamentos
   — Turma: primeira turma disponível
   — Período: último que possui lançamentos (alunos cadastrados)
════════════════════════════════════════════════════════════════ */
function selecionarPadraoInicial() {
    /* 1. Garante que a aba Lançamentos está ativa */
    var abaLanc = document.getElementById("aba-lancamentos");
    var jaAtiva = abaLanc && abaLanc.classList.contains("active");
    if (!jaAtiva) {
        document.querySelectorAll(".content-body").forEach(function(el) { el.classList.remove("active"); });
        document.querySelectorAll(".nav-item").forEach(function(el) { el.classList.remove("active"); });
        if (abaLanc) abaLanc.classList.add("active");
        var btnLanc = document.querySelector('.nav-item[onclick*="lancamentos"]');
        if (btnLanc) btnLanc.classList.add("active");
        atualizarBotoesHeader("lancamentos");
    }

    /* 2. Seleciona a primeira turma VISÍVEL disponível
          (ignora turmas ocultas — já filtradas pelo seletor via getTurmasVisiveis) */
    var sel = document.getElementById("turmaSelect");
    if (sel && sel.options.length > 0) {
        sel.selectedIndex = 0;
        atualizarBadgeTurno();
    }

    /* 3. Seleciona o último período que possui lançamentos DA PRIMEIRA TURMA.
          Percorre os períodos de trás para frente buscando dados apenas da
          turma já selecionada (índice 0). Se nenhum período tiver dados para
          ela, seleciona o primeiro período (DIAG) — nunca abre tela vazia
          por combinação turma×período de turmas diferentes. */
    if (!selP || selP.options.length === 0) return;

    /* Pega o nome da turma que acabou de ser selecionada (índice 0) — já é visível */
    var primeiraTurma = sel && sel.options.length > 0 ? sel.options[0].value : "";
    var ultimoIdx = 0; /* fallback: DIAG */

    if (primeiraTurma) {
        for (var pi = periodosArr.length - 1; pi >= 0; pi--) {
            var periodo = periodosArr[pi].v;
            var alunos = JSON.parse(localStorage.getItem(chaveAlunos(primeiraTurma, periodo))) || [];
            if (alunos.length > 0) { ultimoIdx = pi; break; }
        }
    }

    selP.selectedIndex = ultimoIdx;
    carregar();
}

async function inicializarApp() {
    try { Chart.register(ChartDataLabels); } catch(e) {}

    selP = document.getElementById("periodo");
    if (selP && selP.options.length === 0) {
        periodosArr.forEach(function(p) {
            var o = document.createElement("option");
            o.value = p.v; o.text = p.t; selP.add(o);
        });
    }

    var u = getUsuarioLogado();
    if (u) {
        aplicarDadosUsuarioHeader(u);
        aplicarPermissoesUI(u);
    }

    /* Limpa seleção de ano ANTES de qualquer outra coisa
       — garante que sempre inicia no ano ativo, nunca em cache antigo */
    sessionStorage.removeItem("al_selecionado");
    window.anoLetivoSelecionado = null;

    inicializarTurmas();
    atualizarBotoesHeader("lancamentos");
    detectarMobile();
    window.addEventListener("resize", detectarMobile);
    cfgCarregarFotoDoUsuarioLogado();

    if (window.sbOnline) {
        /* 1. Popula seletor e define o ano ativo PRIMEIRO */
        await alPopularSeletor();
        /* 2. Só então sincroniza tudo com o ano correto */
        await sbSincronizarTudo();
        await atvCarregarDoBanco();
    } else {
        if (typeof atvCarregarDoBanco === "function") await atvCarregarDoBanco();
    }

    inicializarTurmas();
    carregar();
    await sysCarregarDoSupabase();
    /* Seleciona automaticamente: aba Lançamentos, primeira turma, último período com dados */
    selecionarPadraoInicial();

    /* Telemetria: registra início de sessão no Supabase */
    if (typeof sbTelIniciarSessao === "function") {
        var _uTel = getUsuarioLogado();
        if (_uTel) await sbTelIniciarSessao(_uTel);
    }
}

/* ════════════════════════════════════════════════════════════════
   TELEMETRIA — Encerramento de sessão ao fechar a aba
════════════════════════════════════════════════════════════════ */
window.addEventListener("pagehide", function() {
    if (typeof sbTelEncerrarSessao === "function") {
        sbTelEncerrarSessao("fechamento_aba");
    }
});

/* ════════════════════════════════════════════════════════════════
   WINDOW.ONLOAD -- sem Auth, simples e direto
════════════════════════════════════════════════════════════════ */
window.onload = async function() {
    inicializarSupabase();

    selP = document.getElementById("periodo");
    detectarMobile();
    window.addEventListener("resize", detectarMobile);

    /* Aplicar tema salvo ANTES de qualquer renderização — evita flash */
    if (typeof inicializarTema === "function") inicializarTema();

    sysAplicar(sysGetConfig());
    permAplicar(permGetConfig()); /* inicializa _permissoes antes de carregar rotinas */

    /* Testar conexao com o banco */
    await testarConexaoSupabase();

    /* Verificar sessao salva */
    var u = getUsuarioLogado();
    if (u) {
        console.log("[App] Sessao restaurada:", u.nome, "("+u.role+")");
        document.getElementById("login-screen").classList.add("hidden");
        document.getElementById("main-app").style.display = "flex";

        /*
         * RESTAURAÇÃO DE SESSÃO — fluxo único sem race condition:
         *
         * NÃO usar mostrarLoadingSimples/ocultarLoadingSimples aqui.
         * O setTimeout interno de ocultarLoadingSimples(300ms) remove
         * av-visible depois que mostrarLoading já o adicionou — isso
         * causava o modal sumir antes dos 10 segundos (race condition).
         *
         * Fluxo correto:
         * 1. Injeta o usuário no cache de saudação via avlPreencherTela
         * 2. Abre mostrarLoading: exibe boas-vindas completas
         *    (OLÁ, NOME / BOM DIA / frase motivacional / 10 segundos)
         * 3. inicializarApp() roda em paralelo aos 10 segundos
         * 4. ocultarLoading() respeita o tempo mínimo de 10s
         */

        /* Passo 1: injeta usuário no cache — nome e saudação prontos */
        aplicarDadosUsuarioHeader(u);
        aplicarPermissoesUI(u);
        if (typeof avlPreencherTela === "function") avlPreencherTela(u);

        /* Passo 2: abre boas-vindas completas com saudação personalizada */
        mostrarLoading("Carregando dados...");
        try {
            await inicializarApp();
        } finally {
            ocultarLoading();
        }
    } else {
        document.getElementById("login-screen").classList.remove("hidden");
    }
};