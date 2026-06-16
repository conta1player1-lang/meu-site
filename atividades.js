/* ════════════════════════════════════════════════════════════════
   atividades.js — Aba Atividades Pedagógicas (com Supabase)
   A.V. Leitura+ — Sistema de Habilidades
════════════════════════════════════════════════════════════════ */

/* ── Estado ─────────────────────────────────────────────────── */
var atvDados       = [];
var atvProxId      = 1;
var atvView        = "grid";
var atvPagAtual    = 1;
var atvEditandoId  = null;
var atvFiltrados   = [];
var atvArquivoAtual  = null;  /* File object para upload */
var atvArquivoBase64 = null;  /* base64 para preview/salvar */
var currentVizId     = null;

const ATV_POR_PAG = 8;

const ATV_TIPO_ICONE = {
    PDF:    "<i class=\"fas fa-file-pdf\"></i>",
    Jogo:   "<i class=\"fas fa-gamepad\"></i>",
    Vídeo:  "<i class=\"fas fa-play-circle\"></i>",
    Digital:"<i class=\"fas fa-laptop\"></i>",
    Word:   "<i class=\"fas fa-file-word\"></i>",
    Imagem: "<i class=\"fas fa-image\"></i>"
};
const ATV_TIPO_CLS = {
    PDF:    "atv-icon-pdf",
    Jogo:   "atv-icon-jogo",
    Vídeo:  "atv-icon-video",
    Digital:"atv-icon-digital",
    Word:   "atv-icon-word",
    Imagem: "atv-icon-imagem"
};
const ATV_NIVEL_COR = {
    "Pré-leitor 1":    "#ef4444",
    "Pré-leitor 2":    "#fb923c",
    "Leitor iniciante":"#e7d107",
    "Leitor avançado": "#16a34a",
    "Leitor fluente":  "#2563eb"
};
const dotCores = {
    PDF:    "#dc2626",
    Jogo:   "#16a34a",
    Vídeo:  "#3b82f6",
    Digital:"#ea580c",
    Word:   "#1d4ed8",
    Imagem: "#9333ea"
};
// USUARIO_ATUAL removido — usar getUsuarioLogado()

/* ════════════════════════════════════════════════════════════════
   CARREGAR / MOCK
════════════════════════════════════════════════════════════════ */
async function atvCarregarDoBanco() {
    var container = document.getElementById("atv-cards-container");
    if (container) container.innerHTML = '<div class="atv-loading"><div class="spin"></div> Carregando atividades...</div>';

    await _carregarCacheUsuarios(); /* pré-carrega nomes de usuários para resolver autor */
    var dados = await buscarAtividades();
    if (dados && dados.length >= 0) {
        atvDados = dados.map(function(row) {
            /* Resolver autor_nome: preferir campo salvo, fallback para resolver UUID */
            var autorNome = row.autor_nome || "";
            var autorId   = row.criado_por  || "";
            if (!autorNome && autorId) {
                /* Tentar resolver UUID pelo cache de usuários em memória */
                autorNome = _resolverNomeAutor(autorId);
            }
            /* Compatibilidade: nivel/hab podem ser string ou array JSON */
            var nivel = row.nivel || "Pré-leitor 1";
            var hab   = row.habilidade || "";
            try {
                if (typeof nivel === "string" && nivel.startsWith("[")) nivel = JSON.parse(nivel);
                if (typeof hab   === "string" && hab.startsWith("["))   hab   = JSON.parse(hab);
            } catch(e) {}
            return {
                id:           row.id,
                nome:         row.nome         || "(sem nome)",
                tipo:         row.tipo         || "PDF",
                nivel:        nivel,
                hab:          hab,
                desc:         row.descricao    || "",
                alunos:       [],
                autor:        autorNome,
                autor_id:     autorId,
                data:         row.criado_em ? new Date(row.criado_em).toLocaleDateString("pt-BR") : "–",
                arquivo_url:  row.arquivo_url  || null,
                nome_arquivo: row.nome_arquivo || null,
                mime_type:    row.mime_type    || null,
                tamanho:      row.tamanho_bytes|| null
            };
        });
    } else {
        atvDados = obterMockAtividades();
    }

    atvFiltrados = atvDados.slice();
    atvRenderizar();
}

function obterMockAtividades() {
    return [
        { id:1, nome:"Jogo das Sílabas Simples",          tipo:"Jogo",    nivel:"Pré-leitor 2",    hab:"Sílabas Simples",              desc:"Atividade lúdica para treinar sílabas ba, ca, da, fa.",                   alunos:[], autor:"Anderson Veras", data:"01/03/2026" },
        { id:2, nome:"Ficha de Reconhecimento de Letras", tipo:"PDF",     nivel:"Pré-leitor 1",    hab:"Reconhece Letras",              desc:"Folha de atividade para identificação das letras do alfabeto.",            alunos:[], autor:"Anderson Veras", data:"15/02/2026" },
        { id:3, nome:"Texto Curto: A Escola",             tipo:"PDF",     nivel:"Leitor iniciante",hab:"Palavras Simples",              desc:"Texto simples com vocabulário do cotidiano escolar.",                     alunos:[], autor:"Anderson Veras", data:"10/03/2026" },
        { id:4, nome:"Leitura de Frases com Pontuação",   tipo:"Word",    nivel:"Leitor iniciante",hab:"Frases Simples",                desc:"Exercício de leitura em voz alta com frases pontuadas.",                  alunos:[], autor:"Anderson Veras", data:"20/03/2026" },
        { id:5, nome:"Sílabas Complexas: bra, cra, dra",  tipo:"PDF",     nivel:"Leitor avançado", hab:"Sílabas Complexas",             desc:"Material para treino de sílabas complexas.",                             alunos:[], autor:"Anderson Veras", data:"01/04/2026" },
        { id:6, nome:"Parlenda: O Cravo e a Rosa",         tipo:"Vídeo",   nivel:"Leitor fluente",  hab:"Textos com Fluência",           desc:"Vídeo com leitura dramatizada da parlenda clássica.",                    alunos:[], autor:"Anderson Veras", data:"05/04/2026" },
        { id:7, nome:"Palavras Complexas",                 tipo:"Digital", nivel:"Leitor avançado", hab:"Palavras e Frases Complexas",   desc:"Atividade digital de formação de palavras complexas.",                   alunos:[], autor:"Anderson Veras", data:"10/04/2026" },
        { id:8, nome:"Ilustração: Conto O Patinho Feio",   tipo:"Imagem",  nivel:"Leitor fluente",  hab:"Textos com Fluência",           desc:"Sequência narrativa ilustrada.",                                         alunos:[], autor:"Anderson Veras", data:"12/04/2026" }
    ];
}

/* Cache de usuários para resolver UUIDs de autor em atividades antigas */
var _cacheUsuariosAtv = {};
async function _carregarCacheUsuarios() {
    if (Object.keys(_cacheUsuariosAtv).length > 0) return;
    if (!window.sbOnline) return;
    try {
        var lista = await sbBuscarUsuarios();
        if (lista) lista.forEach(function(u) { _cacheUsuariosAtv[u.id] = u.nome; });
    } catch(e) {}
}
function _resolverNomeAutor(uuid) {
    if (!uuid) return "";
    /* Cache em memória */
    if (_cacheUsuariosAtv[uuid]) return _cacheUsuariosAtv[uuid];
    /* Se parece UUID mas não está no cache, retornar abreviado para não mostrar UUID inteiro */
    if (/^[0-9a-f-]{36}$/.test(uuid)) return "–";
    return uuid;
}

/* ════════════════════════════════════════════════════════════════
   FILTROS
════════════════════════════════════════════════════════════════ */
function atvFiltrar() {
    var busca = document.getElementById("atv-busca").value.toLowerCase();
    var fN    = document.getElementById("atv-f-nivel").value;
    var fH    = document.getElementById("atv-f-hab").value;
    var fT    = document.getElementById("atv-f-tipo").value;
    var fO    = document.getElementById("atv-f-ordem").value;

    atvFiltrados = atvDados.filter(function(a) {
        /* nivel e hab podem ser string ou array */
        var niveis = Array.isArray(a.nivel) ? a.nivel : (a.nivel ? [a.nivel] : []);
        var habs   = Array.isArray(a.hab)   ? a.hab   : (a.hab   ? [a.hab]   : []);
        /* Atividade com "Todos os níveis" aparece em qualquer filtro de nível */
        var passaNivel = !fN || niveis.includes(fN) || niveis.includes("Todos os níveis");
        return (!busca || a.nome.toLowerCase().includes(busca) || (a.desc || "").toLowerCase().includes(busca))
            && passaNivel
            && (!fH || habs.includes(fH))
            && (!fT || a.tipo === fT);
    });

    if (fO === "az") {
        atvFiltrados.sort(function(a, b) { return a.nome.localeCompare(b.nome, "pt-BR"); });
    } else if (fO === "nivel") {
        var ord = ["Pré-leitor 1","Pré-leitor 2","Leitor iniciante","Leitor avançado","Leitor fluente"];
        atvFiltrados.sort(function(a, b) { return ord.indexOf(a.nivel) - ord.indexOf(b.nivel); });
    } else {
        atvFiltrados.sort(function(a, b) { return (typeof b.id === "number" ? b.id : 0) - (typeof a.id === "number" ? a.id : 0); });
    }

    atvPagAtual = 1;
    atvRenderizar();
}

function atvLimparFiltros() {
    ["atv-busca","atv-f-nivel","atv-f-hab","atv-f-tipo"].forEach(function(id) { document.getElementById(id).value = ""; });
    document.getElementById("atv-f-ordem").value = "recente";
    atvFiltrar();
}

function atvMudarView(v) {
    atvView = v;
    document.getElementById("atv-btn-grid").classList.toggle("active", v === "grid");
    document.getElementById("atv-btn-list").classList.toggle("active", v === "list");
    atvRenderizar();
}

/* ════════════════════════════════════════════════════════════════
   RENDERIZAÇÃO
════════════════════════════════════════════════════════════════ */
function atvRenderizar() {
    /* Stats */
    var statsEl = document.getElementById("atv-stats-row");
    var tipos   = [...new Set(atvDados.map(function(a) { return a.tipo; }))];
    var sh = "<div class=\"atv-stat-chip\"><span class=\"chip-dot\" style=\"background:#3b82f6\"></span>" + atvDados.length + " atividades</div>";
    tipos.forEach(function(t) {
        var qtd = atvDados.filter(function(a) { return a.tipo === t; }).length;
        sh += "<div class=\"atv-stat-chip\"><span class=\"chip-dot\" style=\"background:" + (dotCores[t] || "#94a3b8") + "\"></span>" + qtd + " " + t + "</div>";
    });
    if (atvFiltrados.length !== atvDados.length) {
        sh += "<div class=\"atv-stat-chip\" style=\"background:#fef9c3;border-color:#fde047;color:#92400e;\"><i class=\"fas fa-filter\" style=\"font-size:9px;\"></i> " + atvFiltrados.length + " resultado(s)</div>";
    }
    statsEl.innerHTML = sh;

    /* Paginação */
    var inicio    = (atvPagAtual - 1) * ATV_POR_PAG;
    var pagina    = atvFiltrados.slice(inicio, inicio + ATV_POR_PAG);
    var totalPags = Math.ceil(atvFiltrados.length / ATV_POR_PAG);

    var container = document.getElementById("atv-cards-container");
    container.className = atvView === "grid" ? "atv-grid" : "atv-list";

    if (pagina.length === 0) {
        container.innerHTML = "<div class=\"atv-empty\" style=\"grid-column:1/-1\"><i class=\"fas fa-folder-open\"></i><p>Nenhuma atividade encontrada</p></div>";
    } else {
        container.innerHTML = pagina.map(function(a) {
            var icone  = ATV_TIPO_ICONE[a.tipo]  || "<i class=\"fas fa-file\"></i>";
            var cls    = ATV_TIPO_CLS[a.tipo]    || "atv-icon-pdf";
            /* nivel/hab podem ser string ou array */
            var nivelArr = Array.isArray(a.nivel) ? a.nivel : (a.nivel ? [a.nivel] : []);
            var habArr   = Array.isArray(a.hab)   ? a.hab   : (a.hab   ? [a.hab]   : []);
            var cor      = ATV_NIVEL_COR[nivelArr[0]] || "#64748b";
            var aidx   = atvDados.indexOf(a);
            var alunosTag = (a.alunos && a.alunos.length > 0)
                ? "<span class=\"atv-tag\" style=\"background:#eff6ff;color:#1d4ed8;\"><i class=\"fas fa-users\" style=\"font-size:9px;\"></i> " + a.alunos.length + " aluno(s)</span>"
                : "";
            /* Permissão de exclusão/edição por role e autoria */
            var u = getUsuarioLogado();
            var podeExcluir = false;
            var podeEditar  = false;
            if (u) {
                var uRole = (u.role || u.cargo || "").toLowerCase().trim();
                var ehAdmin = uRole === "admin" || uRole === "administrador";
                var ehAutor = String(a.autor_id || "") === String(u.id || "") ||
                              (a.autor || "").toLowerCase().trim() === (u.nome || "").toLowerCase().trim();
                if (ehAdmin) {
                    podeExcluir = true;
                    podeEditar  = true;
                } else if (ehAutor) {
                    /* Professor, Supervisor e Diretor podem editar/excluir as próprias atividades */
                    podeExcluir = true;
                    podeEditar  = true;
                }
            }
            var btnExcluir = podeExcluir
                ? "<button class=\"atv-action-btn del\" title=\"Excluir\" onclick=\"atvRemoverIdx(" + aidx + ")\"><i class=\"fas fa-trash\"></i></button>"
                : "";
            /* Botão editar — mesma regra de autoria */
            var btnEditar = podeEditar
                ? "<button class=\"atv-action-btn\" title=\"Editar\" onclick=\"atvEditarIdx(" + aidx + ")\"><i class=\"fas fa-pen\"></i></button>"
                : "";
            var acoes = "<button class=\"atv-action-btn\" title=\"Visualizar\" onclick=\"atvVisualizarIdx(" + aidx + ")\"><i class=\"fas fa-eye\"></i></button>"
                      + btnEditar
                      + btnExcluir;

            if (atvView === "grid") {
                return "<div class=\"atv-card\">"
                    + "<div style=\"display:flex;align-items:flex-start;gap:10px;\">"
                    + "<div class=\"atv-card-icon " + cls + "\">" + icone + "</div>"
                    + "<div class=\"atv-card-body\"><div class=\"atv-card-nome\" title=\"" + a.nome + "\">" + a.nome + "</div>"
                    + "<div class=\"atv-card-desc\">" + a.desc + "</div></div></div>"
                    + "<div class=\"atv-card-tags\">"
                    + nivelArr.map(function(n){var c=ATV_NIVEL_COR[n]||"#64748b";return "<span class=\"atv-tag atv-tag-nivel\" style=\"background:"+c+"22;color:"+c+";\">" + n + "</span>";}).join("")
                    + habArr.map(function(h){return "<span class=\"atv-tag atv-tag-hab\">"+h+"</span>";}).join("")
                    + "<span class=\"atv-tag atv-tag-tipo\">" + a.tipo + "</span>"
                    + alunosTag + "</div>"
                    + "<div class=\"atv-card-actions\">" + acoes + "</div></div>";
            }
            return "<div class=\"atv-card-list-item\">"
                + "<div class=\"atv-card-icon " + cls + "\" style=\"width:36px;height:36px;font-size:12px;\">" + icone + "</div>"
                + "<div class=\"atv-card-body\"><div class=\"atv-card-nome\">" + a.nome + "</div>"
                + "<div class=\"atv-card-tags\" style=\"margin-top:4px;\">"
                + nivelArr.map(function(n){var c=ATV_NIVEL_COR[n]||"#64748b";return "<span class=\"atv-tag atv-tag-nivel\" style=\"background:"+c+"22;color:"+c+";\">" + n + "</span>";}).join("")
                + habArr.map(function(h){return "<span class=\"atv-tag atv-tag-hab\">"+h+"</span>";}).join("")
                + alunosTag + "</div></div>"
                + "<span class=\"atv-tag atv-tag-tipo\" style=\"flex-shrink:0;\">" + a.tipo + "</span>"
                + "<div class=\"atv-card-actions\" style=\"flex-shrink:0;\">" + acoes + "</div></div>";
        }).join("");
    }

    /* Paginação */
    var pagEl = document.getElementById("atv-pagination");
    if (totalPags <= 1) { pagEl.innerHTML = ""; return; }
    var ph = "<button class=\"atv-page-btn\" onclick=\"atvMudarPag(" + (atvPagAtual - 1) + ")\" " + (atvPagAtual === 1 ? "disabled" : "") + ">&#8249;</button>";
    for (var i = 1; i <= totalPags; i++) {
        ph += "<button class=\"atv-page-btn" + (i === atvPagAtual ? " active" : "") + "\" onclick=\"atvMudarPag(" + i + ")\">" + i + "</button>";
    }
    ph += "<button class=\"atv-page-btn\" onclick=\"atvMudarPag(" + (atvPagAtual + 1) + ")\" " + (atvPagAtual === totalPags ? "disabled" : "") + ">&#8250;</button>";
    pagEl.innerHTML = ph;
}

function atvMudarPag(p) {
    if (p < 1 || p > Math.ceil(atvFiltrados.length / ATV_POR_PAG)) return;
    atvPagAtual = p;
    atvRenderizar();
}

/* ════════════════════════════════════════════════════════════════
   FORMULÁRIO
════════════════════════════════════════════════════════════════ */
function atvPopularAlunos() {
    var sel = document.getElementById("atv-alunos-select");
    if (!sel) return;
    var alunos = getAlunos();
    if (alunos.length === 0) {
        sel.innerHTML = "<span style=\"color:#94a3b8;font-size:12px;padding:4px;\">Nenhum aluno no período atual</span>";
        return;
    }
    var selecionados = atvEditandoId
        ? ((atvDados.find(function(x) { return x.id === atvEditandoId; }) || {}).alunos || [])
        : [];
    sel.innerHTML = alunos.map(function(n) {
        var chk = selecionados.includes(n) ? " checked" : "";
        return "<label class=\"atv-aluno-check\"><input type=\"checkbox\" value=\"" + n + "\"" + chk + " onchange=\"atvAtualizarChipsAlunos()\"> " + n + "</label>";
    }).join("");
    atvAtualizarChipsAlunos();
}

function atvAtualizarChipsAlunos() {
    var checks = document.querySelectorAll("#atv-alunos-select input:checked");
    var chips  = document.getElementById("atv-alunos-chips");
    if (!chips) return;
    chips.innerHTML = Array.from(checks).map(function(cb) {
        return "<span class=\"atv-chip-aluno\">" + cb.value
            + "<i class=\"fas fa-times\" onclick=\"atvDesmarcarAluno(this,'" + cb.value + "')\"></i></span>";
    }).join("");
}

function atvDesmarcarAluno(el, nome) {
    document.querySelectorAll("#atv-alunos-select input").forEach(function(cb) {
        if (cb.value === nome) cb.checked = false;
    });
    atvAtualizarChipsAlunos();
}

/* Toggle chip de nível/habilidade */
function atvToggleChip(btn) {
    /* Se "Todos os níveis" estava ativo, desativar antes de selecionar nível específico */
    var todosBtn = btn.closest("#atv-chips-nivel") &&
                   btn.closest("#atv-chips-nivel").querySelector("[data-val='Todos os níveis']");
    if (todosBtn && todosBtn !== btn) todosBtn.classList.remove("active");
    btn.classList.toggle("active");
}

/* "Todos os níveis": ao ativar, desmarca os demais; ao desativar, apenas desmarca */
function atvToggleChipTodosNiveis(btn) {
    var jaAtivo = btn.classList.contains("active");
    atvLimparChips("atv-chips-nivel");
    if (!jaAtivo) btn.classList.add("active");
}

/* Limpar todos os chips de um grupo */
function atvLimparChips(groupId) {
    document.querySelectorAll("#" + groupId + " .atv-chip-sel").forEach(function(c) {
        c.classList.remove("active");
    });
}

/* Ativar chips de acordo com valores salvos (string ou array) */
function atvMarcarChips(groupId, valores) {
    if (!valores) return;
    var arr = Array.isArray(valores) ? valores : [valores];
    document.querySelectorAll("#" + groupId + " .atv-chip-sel").forEach(function(c) {
        c.classList.toggle("active", arr.includes(c.dataset.val));
    });
}

/* Tipos que usam link em vez de upload de arquivo */
var ATV_TIPOS_LINK = ["Jogo", "Vídeo", "Digital"];

function atvToggleTipoForm(tipo) {
    var usaLink = ATV_TIPOS_LINK.indexOf(tipo) >= 0;
    var secArq  = document.getElementById("atv-secao-arquivo");
    var secLnk  = document.getElementById("atv-secao-link");
    if (secArq) secArq.style.display = usaLink ? "none" : "block";
    if (secLnk) secLnk.style.display = usaLink ? "block" : "none";
}

function atvAbrirFormulario() {
    atvEditandoId    = null;
    atvArquivoAtual  = null;
    atvArquivoBase64 = null;
    document.getElementById("atv-panel-titulo").innerText = "Nova atividade";
    ["atv-form-id","atv-form-nome","atv-form-tipo","atv-form-desc","atv-form-link"].forEach(function(id) {
        var el = document.getElementById(id); if (el) el.value = ""; });
    atvLimparChips("atv-chips-nivel");
    atvLimparChips("atv-chips-hab");
    document.getElementById("atv-upload-label").innerText = "Clique para selecionar ou arraste aqui";
    _atvEsconderArquivoAtual();
    _atvOcultarProgresso();
    atvToggleTipoForm(""); /* reset: mostra área de arquivo */
    document.getElementById("modal-atv-form").style.display = "flex";
    atvPopularAlunos();
}

function atvEditarIdx(idx) {
    var a = atvFiltrados[idx];
    if (!a) return;
    atvEditandoId    = a.id;
    atvArquivoAtual  = null;
    atvArquivoBase64 = null;

    document.getElementById("atv-panel-titulo").innerText = "Editar atividade";
    document.getElementById("atv-form-id").value   = a.id;
    document.getElementById("atv-form-nome").value = a.nome  || "";
    document.getElementById("atv-form-tipo").value = a.tipo  || "";
    document.getElementById("atv-form-desc").value = a.desc  || "";

    /* Link para tipos digitais */
    var linkEl = document.getElementById("atv-form-link");
    if (linkEl) linkEl.value = (ATV_TIPOS_LINK.indexOf(a.tipo) >= 0 && a.arquivo_url) ? a.arquivo_url : "";
    atvToggleTipoForm(a.tipo || "");

    atvLimparChips("atv-chips-nivel");
    atvLimparChips("atv-chips-hab");
    atvMarcarChips("atv-chips-nivel", a.nivel);
    atvMarcarChips("atv-chips-hab",   a.hab);

    /* Mostrar arquivo atual se for tipo com arquivo físico */
    if (ATV_TIPOS_LINK.indexOf(a.tipo) < 0 && (a.arquivo_url || localStorage.getItem("atv_arquivo_" + a.id))) {
        _atvMostrarArquivoAtual(a.nome_arquivo || a.nome || "arquivo");
    } else {
        _atvEsconderArquivoAtual();
    }

    document.getElementById("modal-atv-form").style.display = "flex";
    atvPopularAlunos();
}

function atvFecharFormulario() {
    document.getElementById("modal-atv-form").style.display = "none";
    atvEditandoId    = null;
    atvArquivoAtual  = null;
    atvArquivoBase64 = null;
    _atvOcultarProgresso();
}

function _atvMostrarArquivoAtual(nome) {
    var el = document.getElementById("atv-arquivo-atual");
    var nm = document.getElementById("atv-arquivo-atual-nome");
    if (el) { el.style.display = "flex"; }
    if (nm) nm.textContent = nome;
}
function _atvEsconderArquivoAtual() {
    var el = document.getElementById("atv-arquivo-atual");
    if (el) el.style.display = "none";
}
function atvRemoverArquivoAtual() {
    atvArquivoAtual  = null;
    atvArquivoBase64 = null;
    _atvEsconderArquivoAtual();
    document.getElementById("atv-upload-label").innerText = "Clique para selecionar ou arraste aqui";
    document.getElementById("atv-file-input").value = "";
}

function atvOnFile(input) {
    atvArquivoAtual = (input.files && input.files[0]) ? input.files[0] : null;
    if (atvArquivoAtual) {
        document.getElementById("atv-upload-label").innerText = atvArquivoAtual.name;
        var reader = new FileReader();
        reader.onload = function(e) { atvArquivoBase64 = e.target.result; };
        reader.readAsDataURL(atvArquivoAtual);
    }
}

async function atvSalvar() {
    var nome = document.getElementById("atv-form-nome").value.trim();
    var tipo = document.getElementById("atv-form-tipo").value;
    var desc = document.getElementById("atv-form-desc").value.trim();

    /* Nível: lê chips selecionados (multi-seleção) */
    var niveisChecked = document.querySelectorAll("#atv-chips-nivel .atv-chip-sel.active");
    var nivel = Array.from(niveisChecked).map(function(el) { return el.dataset.val; });
    if (nivel.length === 1) nivel = nivel[0]; /* string simples se só um */

    /* Habilidade: lê chips selecionados (multi-seleção) */
    var habChecked = document.querySelectorAll("#atv-chips-hab .atv-chip-sel.active");
    var hab = Array.from(habChecked).map(function(el) { return el.dataset.val; });
    if (hab.length === 1) hab = hab[0];
    if (hab.length === 0) hab = "";

    if (!nome || !tipo || !nivel || nivel.length === 0) {
        mostrarModalAviso("Campos obrigatórios", "Preencha nome, tipo e ao menos um nível.");
        return;
    }

    /* Link para tipos digitais (Jogo, Vídeo, Digital) */
    var linkDigital = null;
    if (ATV_TIPOS_LINK.indexOf(tipo) >= 0) {
        var linkEl = document.getElementById("atv-form-link");
        linkDigital = linkEl ? linkEl.value.trim() : null;
    }

    var checks  = document.querySelectorAll("#atv-alunos-select input:checked");
    var alunos  = Array.from(checks).map(function(cb) { return cb.value; });
    var dataStr = new Date().toLocaleDateString("pt-BR");
    var u       = getUsuarioLogado();
    var payload = {
        nome: nome, tipo: tipo,
        nivel: Array.isArray(nivel) ? JSON.stringify(nivel) : nivel,
        habilidade: Array.isArray(hab) ? JSON.stringify(hab) : hab,
        descricao: desc,
        autor_nome: u ? u.nome : "",
        arquivo_url: linkDigital || undefined
    };

    /* Mostrar progresso no botão salvar */
    var btnSalvar = document.getElementById("atv-btn-salvar");
    if (btnSalvar) { btnSalvar.disabled = true; btnSalvar.innerHTML = "<i class='fas fa-spinner fa-spin'></i> Salvando..."; }

    var salvoNoBanco = null;
    var novaAtv      = null;

    if (atvEditandoId) {
        /* ── MODO EDIÇÃO ── */
        if (window.sbOnline && isUUID(atvEditandoId)) {
            var editPayload = {
                nome: nome, tipo: tipo,
                nivel: Array.isArray(nivel) ? JSON.stringify(nivel) : nivel,
                habilidade: Array.isArray(hab) ? JSON.stringify(hab) : hab,
                descricao: desc
            };
            if (linkDigital !== null) editPayload.arquivo_url = linkDigital;
            await atualizarAtividade(atvEditandoId, editPayload);
        }
        /* Atualizar em memória */
        var idx = atvDados.findIndex(function(x) { return x.id === atvEditandoId; });
        if (idx >= 0) {
            atvDados[idx].nome  = nome;
            atvDados[idx].tipo  = tipo;
            atvDados[idx].nivel = nivel;
            atvDados[idx].hab   = hab;
            atvDados[idx].desc  = desc;
            if (linkDigital !== null) atvDados[idx].arquivo_url = linkDigital;
            novaAtv = atvDados[idx];
        }

        /* Upload de arquivo novo se fornecido */
        if (atvArquivoAtual && novaAtv) {
            if (window.sbOnline) {
                _atvMostrarProgresso(0);
                var resultado = await sbUploadArquivoAtividade(
                    atvArquivoAtual, u ? u.id : null,
                    function(pct) { _atvMostrarProgresso(pct); }
                );
                if (resultado) {
                    await sbAtualizarArquivoAtividade(atvEditandoId, resultado);
                    novaAtv.arquivo_url  = resultado.url;
                    novaAtv.nome_arquivo = resultado.nome;
                } else if (atvArquivoBase64) {
                    localStorage.setItem("atv_arquivo_" + atvEditandoId, atvArquivoBase64);
                }
                _atvOcultarProgresso();
            } else if (atvArquivoBase64) {
                localStorage.setItem("atv_arquivo_" + atvEditandoId, atvArquivoBase64);
            }
        }

        if (btnSalvar) { btnSalvar.disabled = false; btnSalvar.innerHTML = "<i class='fas fa-save'></i> Salvar atividade"; }
        atvFecharFormulario();
        atvFiltrar();
        mostrarModalAviso("Atividade atualizada", "\"" + nome + "\" foi salva com sucesso.");
        return;
    }

    /* ── MODO CRIAÇÃO ── */
    salvoNoBanco = await criarAtividade(payload);
    var novaAtv = {
        id:           salvoNoBanco ? salvoNoBanco.id : "local_" + atvProxId++,
        nome:         nome, tipo: tipo, nivel: nivel,
        hab:          hab,  desc: desc, alunos: alunos,
        autor:        u ? u.nome : "", autor_id: u ? u.id : "", data: dataStr,
        arquivo_url:  linkDigital || null,
        nome_arquivo: null
    };

    /* Upload do arquivo — Storage primeiro, localStorage como fallback */
    if (atvArquivoAtual) {
        if (window.sbOnline && salvoNoBanco) {
            /* Mostrar barra de progresso */
            _atvMostrarProgresso(0);

            var resultado = await sbUploadArquivoAtividade(
                atvArquivoAtual,
                u ? u.id : null,
                function(pct) { _atvMostrarProgresso(pct); }
            );

            if (resultado) {
                /* Upload OK — atualizar registro com URL */
                await sbAtualizarArquivoAtividade(salvoNoBanco.id, resultado);
                novaAtv.arquivo_url  = resultado.url;
                novaAtv.nome_arquivo = resultado.nome;
                console.log("[Atividades] Upload OK:", resultado.url);
            } else {
                /* Upload falhou — usar localStorage como fallback */
                console.warn("[Atividades] Upload falhou — salvando localmente.");
                if (atvArquivoBase64) {
                    localStorage.setItem("atv_arquivo_" + novaAtv.id, atvArquivoBase64);
                }
            }
            _atvOcultarProgresso();
        } else {
            /* Offline ou sem id do banco — localStorage */
            if (atvArquivoBase64) {
                localStorage.setItem("atv_arquivo_" + novaAtv.id, atvArquivoBase64);
            }
        }
    }

    atvArquivoAtual  = null;
    atvArquivoBase64 = null;
    atvDados.unshift(novaAtv);

    if (btnSalvar) { btnSalvar.disabled = false; btnSalvar.innerHTML = "<i class='fas fa-save'></i> Salvar atividade"; }
    atvFecharFormulario();
    atvFiltrar();
}

/* ── Barra de progresso de upload ── */
function _atvMostrarProgresso(pct) {
    var el = document.getElementById("atv-upload-progress");
    if (!el) return;
    el.style.display = "block";
    var bar  = el.querySelector(".atv-prog-bar-fill");
    var txt  = el.querySelector(".atv-prog-txt");
    if (bar) bar.style.width = pct + "%";
    if (txt) txt.textContent = pct < 100 ? "Enviando... " + pct + "%" : "Upload concluído ✓";
}
function _atvOcultarProgresso() {
    var el = document.getElementById("atv-upload-progress");
    if (el) setTimeout(function() { el.style.display = "none"; }, 1500);
}

/* ════════════════════════════════════════════════════════════════
   VISUALIZAR
════════════════════════════════════════════════════════════════ */
function _inferirMimePorTipo(tipo) {
    var mapa = { PDF:"application/pdf", Imagem:"image/jpeg", Word:"application/msword" };
    return mapa[tipo] || "";
}

function atvVisualizar(id) {
    var a = atvDados.find(function(x) { return x.id === id; });
    if (!a) return;
    currentVizId = id;

    var cor    = dotCores[a.tipo] || "#64748b";
    var icone  = ATV_TIPO_ICONE[a.tipo] || "<i class=\"fas fa-file\"></i>";
    var nivCls = { "Pré-leitor 1":"pre1","Pré-leitor 2":"pre2","Leitor iniciante":"iniciante","Leitor avançado":"avancado","Leitor fluente":"fluente" };

    document.getElementById("mviz-titulo").innerText = a.nome;
    var badge = document.getElementById("mviz-tipo-badge");
    badge.innerHTML  = icone + " " + a.tipo;
    badge.style.cssText = "display:inline-flex;align-items:center;gap:7px;padding:5px 13px;border-radius:20px;font-size:12px;font-weight:700;background:" + cor + "22;color:" + cor + ";";

    /* Nivel e hab podem ser string ou array */
    var nivelArr = Array.isArray(a.nivel) ? a.nivel : (a.nivel ? [a.nivel] : []);
    var habArr   = Array.isArray(a.hab)   ? a.hab   : (a.hab   ? [a.hab]   : []);
    document.getElementById("mviz-nivel").innerHTML = nivelArr.map(function(n) {
        return "<span class=\"badge-nivel " + (nivCls[n] || "pre1") + "\">" + n + "</span>";
    }).join(" ") || "–";
    document.getElementById("mviz-hab").innerHTML = habArr.length
        ? habArr.map(function(h) { return "<span style=\"background:#f1f5f9;padding:2px 7px;border-radius:8px;font-size:11px;\">" + h + "</span>"; }).join(" ")
        : "–";
    document.getElementById("mviz-autor").innerText  = a.autor || "–";
    document.getElementById("mviz-data").innerText   = a.data  || "–";
    document.getElementById("mviz-desc").innerText   = a.desc  || "–";

    /* Alunos vinculados */
    var alunosWrap  = document.getElementById("mviz-alunos-wrap");
    var alunosChips = document.getElementById("mviz-alunos-chips");
    if (a.alunos && a.alunos.length > 0) {
        alunosWrap.style.display = "block";
        alunosChips.innerHTML = a.alunos.map(function(n) { return "<span class=\"aluno-chip-viz\">" + n + "</span>"; }).join("");
    } else {
        alunosWrap.style.display = "none";
    }

    /* Pré-visualização do arquivo */
    var previewArea  = document.getElementById("mviz-preview-area");
    var previewLabel = document.getElementById("mviz-preview-label");
    var pdfNav       = document.getElementById("mviz-pdf-nav");
    pdfNav.style.display = "none";

    /* Prioridade: arquivo_url do Storage → localStorage (atividades antigas/offline) */
    var urlStorage  = a.arquivo_url || null;
    var localData   = localStorage.getItem("atv_arquivo_" + id);
    var arquivoSrc  = urlStorage || localData;   /* URL string ou base64 */
    var isUrl       = urlStorage && !urlStorage.startsWith("data:");

    if (arquivoSrc) {
        var mime = isUrl
            ? (a.mime_type || _inferirMimePorTipo(a.tipo))
            : arquivoSrc.split(";")[0].replace("data:","");

        /* Tipos digitais (link) — mostrar botão de acesso, não tentar incorporar */
        if (ATV_TIPOS_LINK.indexOf(a.tipo) >= 0) {
            previewLabel.innerText = "Conteúdo externo";
            previewArea.innerHTML  = "<div style=\"text-align:center;padding:40px 30px;\">"
                + "<i class=\"" + (a.tipo === "Vídeo" ? "fas fa-play-circle" : a.tipo === "Jogo" ? "fas fa-gamepad" : "fas fa-laptop") + "\" style=\"font-size:52px;color:" + (dotCores[a.tipo] || "#3b82f6") + ";display:block;margin-bottom:16px;\"></i>"
                + "<p style=\"font-size:13px;color:#475569;margin-bottom:6px;font-weight:600;\">" + a.nome + "</p>"
                + "<p style=\"font-size:11px;color:#94a3b8;margin-bottom:20px;\">" + (a.tipo === "Vídeo" ? "Vídeo externo" : a.tipo === "Jogo" ? "Jogo interativo" : "Conteúdo digital") + "</p>"
                + "<a href=\"" + arquivoSrc + "\" target=\"_blank\" rel=\"noopener\" class=\"btn-acesso-digital\">"
                + "<i class=\"fas fa-external-link-alt\"></i> Acessar atividade</a></div>";
        } else if (mime === "application/pdf" || a.tipo === "PDF") {
            previewLabel.innerText = "PDF — use a barra do PDF para navegar";
            previewArea.innerHTML  = "<iframe src=\"" + arquivoSrc + "#toolbar=1&view=FitH\" style=\"width:100%;height:100%;border:none;\"></iframe>";
        } else if (mime && mime.startsWith("image/")) {
            previewLabel.innerText = "Imagem";
            previewArea.innerHTML  = "<img src=\"" + arquivoSrc + "\" style=\"max-width:100%;max-height:100%;object-fit:contain;padding:16px;\" alt=\"" + a.nome + "\">";
        } else {
            var nomeArquivo = a.nome_arquivo || a.nome;
            previewLabel.innerText = "Arquivo";
            previewArea.innerHTML  = "<div style=\"text-align:center;padding:30px;\">"
                + "<i class=\"" + (a.tipo === "Word" ? "fas fa-file-word" : "fas fa-file") + "\" style=\"font-size:56px;color:#3b82f6;display:block;margin-bottom:12px;\"></i>"
                + "<p style=\"font-size:13px;color:#475569;margin-bottom:16px;font-weight:600;\">" + nomeArquivo + "</p>"
                + "<a href=\"" + arquivoSrc + "\" download=\"" + nomeArquivo + "\" style=\"background:#2563eb;color:white;padding:9px 20px;border-radius:8px;text-decoration:none;font-size:12px;font-weight:700;\">"
                + "<i class=\"fas fa-download\"></i> Baixar arquivo</a></div>";
        }
    } else if (ATV_TIPOS_LINK.indexOf(a.tipo) >= 0) {
        /* Tipo digital mas sem link cadastrado */
        previewLabel.innerText = "Sem link cadastrado";
        previewArea.innerHTML  = "<div class=\"mviz-no-preview\">"
            + "<i class=\"fas fa-link\" style=\"font-size:52px;color:#cbd5e1;display:block;margin-bottom:12px;\"></i>"
            + "<p style=\"font-size:13px;margin-bottom:6px;font-weight:600;color:#64748b;\">Nenhum link informado</p>"
            + "<p style=\"font-size:11px;color:#94a3b8;\">Edite a atividade e informe a URL</p></div>";
    } else {
        previewLabel.innerText = "Sem arquivo anexado";
        previewArea.innerHTML  = "<div class=\"mviz-no-preview\">"
            + "<i class=\"fas fa-file-alt\" style=\"font-size:52px;color:#cbd5e1;display:block;margin-bottom:12px;\"></i>"
            + "<p style=\"font-size:13px;margin-bottom:6px;font-weight:600;color:#64748b;\">Nenhum arquivo</p>"
            + "<p style=\"font-size:11px;color:#94a3b8;\">Faça upload ao criar ou editar</p></div>";
    }

    /* Controla visibilidade do botão Imprimir conforme tipo:
       - PDF e tipos digitais (Jogo/Vídeo/Digital): sem botão (browser/link já oferecem)
       - Imagem: mantém botão
       - Word/outros sem arquivo: mantém botão (abre fallback de download) */
    var btnImprimir = document.getElementById("mviz-btn-imprimir");
    if (btnImprimir) {
        var semImpressao = (ATV_TIPOS_LINK.indexOf(a.tipo) >= 0);
        /* No mobile, PDF não tem barra do browser — mostra botão imprimir */
        var isMobile = window.innerWidth <= 900;
        if (a.tipo === "PDF" && !isMobile) semImpressao = true;
        btnImprimir.style.display = semImpressao ? "none" : "";
    }

    /* Word — renderização local com mammoth.js
       Elimina o Office Online iframe (nova aba, violação unload, sem controle de impressão).
       Mammoth converte DOCX para HTML no browser, exibindo no próprio modal.
       Imagens são embutidas em base64 — funcionam offline e na impressão.
       Limitações: cabeçalho/rodapé do Word são ignorados; quebras de página manuais
       não são honradas; estilos visuais avançados (cores de célula etc.) são simplificados. */
    var _isWord = (a.tipo === "Word")
        || (a.mime_type && (a.mime_type.indexOf("word") >= 0
            || a.mime_type.indexOf("officedocument") >= 0));

    if (_isWord) {
        previewLabel.innerText = "Word — carregando pré-visualização...";
        previewArea.innerHTML  = "<div style='display:flex;align-items:center;justify-content:center;"
            + "height:100%;flex-direction:column;gap:12px;color:#64748b;'>"
            + "<i class='fas fa-spinner fa-spin' style='font-size:28px;'></i>"
            + "<span style='font-size:13px;'>Processando documento...</span></div>";

        /* Função auxiliar: converte ArrayBuffer → HTML via mammoth e injeta no previewArea */
        function _renderWordBuffer(arrayBuffer) {
            if (typeof mammoth === "undefined") {
                previewArea.innerHTML = "<div style='padding:24px;text-align:center;color:#ef4444;'>"
                    + "<i class='fas fa-exclamation-triangle' style='font-size:28px;display:block;margin-bottom:8px;'></i>"
                    + "Biblioteca de visualização não carregada.<br>Verifique sua conexão e recarregue.</div>";
                previewLabel.innerText = "Word — erro";
                return;
            }
            var opts = {
                convertImage: mammoth.images.imgElement(function(image) {
                    return image.read("base64").then(function(b64) {
                        return { src: "data:" + image.contentType + ";base64," + b64 };
                    });
                })
            };
            mammoth.convertToHtml({ arrayBuffer: arrayBuffer }, opts).then(function(result) {
                var PREVIEW_CSS = "<style>"
                    + ".wd-doc{font-family:Georgia,serif;font-size:13px;line-height:1.7;"
                    + "color:#1e293b;padding:24px 32px;}"
                    + ".wd-doc h1{font-size:17px;font-weight:700;margin:0 0 14px;color:#0f172a;"
                    + "border-bottom:2px solid #3b82f6;padding-bottom:6px;}"
                    + ".wd-doc h2{font-size:14px;font-weight:700;margin:18px 0 8px;color:#1e40af;}"
                    + ".wd-doc h3{font-size:13px;font-weight:700;margin:12px 0 6px;}"
                    + ".wd-doc p{margin:6px 0;}"
                    + ".wd-doc table{border-collapse:collapse;width:100%;margin:12px 0;font-size:12px;}"
                    + ".wd-doc td,.wd-doc th{border:1px solid #cbd5e1;padding:6px 10px;vertical-align:top;}"
                    + ".wd-doc tr:first-child td{background:#f1f5f9;font-weight:600;}"
                    + ".wd-doc ul,.wd-doc ol{margin:8px 0 8px 24px;padding:0;}"
                    + ".wd-doc li{margin:3px 0;}"
                    + ".wd-doc img{max-width:100%;height:auto;display:block;margin:10px auto;border-radius:4px;}"
                    + "</style>";
                previewArea.innerHTML = PREVIEW_CSS
                    + "<div class='wd-doc'>" + result.value + "</div>";
                previewLabel.innerText = "Word — pré-visualização";
                /* Guarda o HTML gerado para uso na impressão */
                previewArea.dataset.wordHtml = result.value;
            }).catch(function(err) {
                previewArea.innerHTML = "<div style='padding:24px;text-align:center;color:#ef4444;'>"
                    + "<i class='fas fa-exclamation-triangle' style='font-size:28px;display:block;margin-bottom:8px;'></i>"
                    + "Não foi possível renderizar o documento.<br><small>" + (err.message||"") + "</small></div>";
                previewLabel.innerText = "Word — erro ao processar";
            });
        }

        var wordUrlPublic = a.arquivo_url && !a.arquivo_url.startsWith("data:") ? a.arquivo_url : null;
        var wordBase64    = !wordUrlPublic ? localStorage.getItem("atv_arquivo_" + a.id) : null;

        if (wordUrlPublic) {
            /* Arquivo no Supabase Storage: fetch como ArrayBuffer */
            fetch(wordUrlPublic)
                .then(function(r) {
                    if (!r.ok) throw new Error("HTTP " + r.status);
                    return r.arrayBuffer();
                })
                .then(_renderWordBuffer)
                .catch(function(err) {
                    /* Fallback: abre no Office Online se o fetch falhar (CORS etc.) */
                    console.warn("[Word] fetch falhou, usando Office Online:", err.message);
                    var viewerUrl = "https://view.officeapps.live.com/op/embed.aspx?src="
                        + encodeURIComponent(wordUrlPublic);
                    previewArea.innerHTML = "<iframe src='" + viewerUrl
                        + "' style='width:100%;height:100%;border:none;'></iframe>";
                    previewLabel.innerText = "Word — pré-visualização (Office Online)";
                });
        } else if (wordBase64) {
            /* Arquivo base64 local: converte para ArrayBuffer */
            try {
                var bStr = atob(wordBase64.split(",")[1] || wordBase64);
                var bytes = new Uint8Array(bStr.length);
                for (var i = 0; i < bStr.length; i++) bytes[i] = bStr.charCodeAt(i);
                _renderWordBuffer(bytes.buffer);
            } catch(e) {
                previewArea.innerHTML = "<div style='padding:24px;text-align:center;color:#ef4444;'>"
                    + "Arquivo local inválido ou corrompido.</div>";
                previewLabel.innerText = "Word — erro";
            }
        }
        /* else: mantém o bloco de download já renderizado pelo else acima */
    }

    document.getElementById("modal-atv-viz").style.display = "flex";
}

/* ════════════════════════════════════════════════════════════════
   IMPRIMIR ATIVIDADE
════════════════════════════════════════════════════════════════ */
function atvImprimirAtividade(id) {
    var a = atvDados.find(function(x) { return x.id === id; });
    if (!a) return;

    /* Tipos digitais sem impressão */
    if (ATV_TIPOS_LINK.indexOf(a.tipo) >= 0) return;

    /* PDF no mobile: abre em nova aba para o browser mobile imprimir */
    if (a.tipo === "PDF") {
        var pdfSrc = a.arquivo_url || localStorage.getItem("atv_arquivo_" + id);
        if (pdfSrc) window.open(pdfSrc, "_blank");
        return;
    }

    var urlStorage = a.arquivo_url || null;
    var localData  = localStorage.getItem("atv_arquivo_" + id);
    var src        = urlStorage || localData;

    /* ── WORD com URL pública ──────────────────────────────────────────
       O conteúdo Word é renderizado dentro de um iframe do Microsoft
       Office Online Viewer (view.officeapps.live.com) — domínio externo.
       JavaScript não consegue acessar o conteúdo dentro desse iframe por
       Same-Origin Policy, portanto não é possível capturar o HTML renderizado.

       Solução: abre o viewer em janela dedicada usando a URL de impressão
       direta do Office Online (?action=print), que carrega o documento já
       no modo de impressão nativo do viewer — preserva todo o conteúdo,
       tabelas, imagens e formatação exatamente como exibido na pré-visualização.
    ──────────────────────────────────────────────────────────────────── */
    var isWord = (a.tipo === "Word")
        || (a.mime_type && (a.mime_type.indexOf("word") >= 0
            || a.mime_type.indexOf("officedocument") >= 0));

    if (isWord) {
        /* Impressão via mammoth: usa o HTML já renderizado no previewArea.
           O conteúdo (texto, tabelas, imagens base64) está em previewArea.dataset.wordHtml.
           Abre popup isolado com CSS de impressão otimizado — sem nova aba permanente,
           sem dependência do Office Online, sem violação de Permissions Policy. */
        var previewArea = document.getElementById("mviz-preview-area");
        var wordHtml    = previewArea ? previewArea.dataset.wordHtml : null;

        if (!wordHtml) {
            /* Preview ainda não renderizado ou falhou — orienta o usuário */
            mostrarModalAviso(
                "Aguarde o carregamento",
                "A pré-visualização do documento ainda está sendo processada. "
                + "Aguarde ela aparecer no modal e tente imprimir novamente."
            );
            return;
        }

        var PRINT_CSS = "<style>"
            + "body{font-family:Georgia,serif;font-size:11pt;line-height:1.6;"
            + "color:#000;margin:15mm 20mm;background:#fff;}"
            + "h1{font-size:14pt;font-weight:700;margin:0 0 10pt;"
            + "border-bottom:1pt solid #000;padding-bottom:4pt;page-break-after:avoid;}"
            + "h2{font-size:12pt;font-weight:700;margin:12pt 0 5pt;page-break-after:avoid;}"
            + "h3{font-size:11pt;font-weight:700;margin:9pt 0 4pt;page-break-after:avoid;}"
            + "p{margin:4pt 0;}"
            + "table{border-collapse:collapse;width:100%;margin:8pt 0;page-break-inside:avoid;}"
            + "td,th{border:1pt solid #000;padding:4pt 8pt;font-size:10pt;vertical-align:top;}"
            + "tr:first-child td{background:#f5f5f5;font-weight:600;}"
            + "ul,ol{margin:5pt 0 5pt 18pt;padding:0;}"
            + "li{margin:2pt 0;}"
            + "img{max-width:100%;height:auto;display:block;margin:6pt auto;"
            + "page-break-inside:avoid;}"
            + "@page{margin:15mm 20mm;}"
            + "</style>";

        var janela = window.open("", "_blank",
            "width=900,height=700,menubar=no,toolbar=no,location=no,status=no");
        if (!janela) {
            mostrarModalAviso(
                "Pop-up bloqueado",
                "Permita pop-ups para este site nas configurações do navegador e tente novamente."
            );
            return;
        }
        janela.document.write(
            "<!DOCTYPE html><html><head><meta charset='utf-8'>"
            + "<title>" + a.nome + "</title>"
            + PRINT_CSS
            + "</head><body>"
            + wordHtml
            + "<script>window.onload=function(){window.print();"
            + "window.onafterprint=function(){window.close();};};<\/script>"
            + "</body></html>"
        );
        janela.document.close();
        return;
    }

    /* ── IMAGEM ──────────────────────────────────────────────────────── */
    if (a.tipo === "Imagem" && src) {
        var bodyHtml = "<div style='text-align:center;'>"
            + "<img src='" + src + "' style='max-width:100%;height:auto;"
            + "display:block;margin:0 auto;page-break-inside:avoid;'>"
            + "</div>";

        var janela = window.open("", "_blank",
            "width=800,height=600,menubar=no,toolbar=no,location=no,status=no");
        if (!janela) {
            mostrarModalAviso("Bloqueado", "Permita pop-ups para este site e tente novamente.");
            return;
        }
        janela.document.write(
            "<!DOCTYPE html><html><head>"
            + "<meta charset='utf-8'>"
            + "<title>" + a.nome + "</title>"
            + "<style>"
            + "* { margin:0; padding:0; box-sizing:border-box; }"
            + "body { background:#fff; }"
            + "@media print { body { margin:0; } img { max-width:100%; page-break-inside:avoid; } }"
            + "</style>"
            + "</head><body>"
            + bodyHtml
            + "<script>window.onload=function(){ window.print(); window.onafterprint=function(){ window.close(); }; }<\/script>"
            + "</body></html>"
        );
        janela.document.close();
        return;
    }

    /* ── Word base64 / sem URL pública ───────────────────────────────── */
    if (isWord) {
        mostrarModalAviso(
            "Impressão não disponível",
            "Este arquivo Word está armazenado localmente e não pode ser impresso diretamente. "
            + "Faça o download e imprima pelo Word ou Google Docs."
        );
        return;
    }

    mostrarModalAviso("Sem conteúdo", "Esta atividade não tem arquivo para imprimir.");
}

/* ════════════════════════════════════════════════════════════════
   REMOVER ATIVIDADE
════════════════════════════════════════════════════════════════ */
function atvRemover(id) {
    var a = atvDados.find(function(x) { return x.id === id; });
    if (!a) return;
    mostrarModalConfirmacao("Remover atividade", "Deseja remover \"" + a.nome + "\"?", async function() {
        /* Limpar localStorage (atividades antigas) */
        localStorage.removeItem("atv_arquivo_" + id);
        atvDados = atvDados.filter(function(x) { return x.id !== id; });
        atvFiltrar();
        if (isUUID(id)) {
            /* Passa arquivo_url para deletarAtividade remover do Storage também */
            var ok = await deletarAtividade(id, a.arquivo_url || null);
            if (!ok) console.warn("[Atividades] Removido localmente, falha no banco.");
        }
    });
}

/* ── Wrappers seguros por índice (evita problemas com UUID) ── */
function atvVisualizarIdx(idx) { var a = atvDados[idx]; if (a) atvVisualizar(a.id); }
function atvImprimirIdx(idx)   { var a = atvDados[idx]; if (a) atvImprimirAtividade(a.id); }
function atvRemoverIdx(idx)    { var a = atvDados[idx]; if (a) atvRemover(a.id); }