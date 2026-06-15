/* ════════════════════════════════════════════════════════════════
   usuarios.js v4.0 -- Login por telefone + senha
   Roles: admin | professor | supervisora | diretor
   ────────────────────────────────────────────────────────────────
   REGRAS DE PERMISSÃO:
   • admin        — tudo, em qualquer ano
   • professor    — lançamentos (turmas vinculadas), atividades/rotinas próprias
   • supervisora  — visualiza lançamentos, edita atividades/rotinas próprias,
                    NÃO lança notas (a menos que vinculado a turma)
   • diretor      — idêntico a supervisora (mesmo nível, cargo diferente)
   A.V. Leitura+
════════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════════
   SESSÃO
════════════════════════════════════════════════════════════════ */
function getUsuarioLogado() {
    try { return JSON.parse(localStorage.getItem("usuario_logado") || "null"); }
    catch(e) { return null; }
}

/** Retorna o role normalizado, suportando tanto u.role quanto u.cargo */
function getUserRole() {
    var u = getUsuarioLogado();
    if (!u) return "";
    return (u.role || u.cargo || "").toLowerCase().trim();
}

function isRole(role) {
    var u = getUsuarioLogado();
    if (!u) return false;
    var r = (u.role || u.cargo || "").toLowerCase().trim();
    return r === role.toLowerCase();
}

function isAdmin()       { return isRole("admin") || isRole("administrador"); }

/** Supervisor OU Diretor — mesmo nível, cargos diferentes */
function isSupervisor()  {
    var r = getUserRole();
    return r === "supervisora" || r === "supervisor" || r === "diretor" || r === "diretora";
}

function isSupervisora() { return isSupervisor(); }   // legado
function isProfessor()   { return isRole("professor"); }

/** True para qualquer role que NÃO seja admin */
function isUsuarioComum() { return !isAdmin(); }

/* ════════════════════════════════════════════════════════════════
   VÍNCULO TITULAR / APOIO
════════════════════════════════════════════════════════════════ */

/**
 * Retorna o tipo_vinculo do professor logado para a turma informada.
 * Lê do cache local (turmas_lista). Retorna "titular", "apoio" ou null.
 */
function alGetTipoVinculo(nomeTurma) {
    if (!nomeTurma) return null;
    var turmas = typeof getTurmasStorage === "function" ? getTurmasStorage() : [];
    var nNorm  = nomeTurma.toLowerCase().trim();
    var t = turmas.find(function(t) {
        var n = (typeof t === "object" ? t.nome : t) || "";
        return n.toLowerCase().trim() === nNorm;
    });
    if (!t || typeof t !== "object") return "titular"; /* legado sem objeto: assume titular */
    return (t.tipo_vinculo || "titular").toLowerCase();
}

/**
 * Retorna true se o professor logado é TITULAR da turma informada.
 * Admin sempre retorna true.
 */
function alEhTitularDaTurma(nomeTurma) {
    if (isAdmin()) return true;
    /* Não-professores sem turma: comportamento anterior (supervisor visualiza) */
    if (!isProfessor() && !isSupervisor()) return true;
    return alGetTipoVinculo(nomeTurma) !== "apoio";
}

/**
 * Retorna true se o professor logado é APOIO da turma atual.
 * Usado para ocultar controles de edição na UI.
 */
function alEhApoioDaTurmaAtual() {
    if (isAdmin()) return false;
    var turmaAtual = typeof getTurmaAtual === "function" ? getTurmaAtual() : null;
    if (!turmaAtual) return false;
    return alGetTipoVinculo(turmaAtual) === "apoio";
}

/* ════════════════════════════════════════════════════════════════
   PERMISSÕES ESPECÍFICAS
════════════════════════════════════════════════════════════════ */

/**
 * Pode editar LANÇAMENTOS (notas)?
 * - Admin: sempre
 * - Apoio: NUNCA (independente do ano)
 * - Titular/Professor/Supervisor: só no ano ativo
 */
function verificarPermissaoEdicao() {
    if (isAdmin()) return true;

    /* Verificar vínculo de apoio ANTES do modo histórico */
    var turmaAtual = typeof getTurmaAtual === "function" ? getTurmaAtual() : null;
    if (turmaAtual && alGetTipoVinculo(turmaAtual) === "apoio") {
        mostrarModalAviso("Sem permissão",
            "Você está vinculado(a) a esta turma como <strong>Professor(a) de Apoio</strong>.<br>" +
            "Apenas o professor titular pode lançar e editar avaliações.");
        return false;
    }

    if (typeof alIsModoHistorico === "function" && alIsModoHistorico()) {
        var sel = typeof alGetAnoSelecionado === "function" ? alGetAnoSelecionado() : null;
        mostrarModalAviso("Modo histórico",
            "Não é possível editar dados do Ano Letivo " + (sel ? sel.ano : "anterior") +
            ".<br>Apenas visualização é permitida em anos passados.");
        return false;
    }

    if (isSupervisor() && window._modoSomenteLeitura) {
        mostrarModalAviso("Sem permissão",
            "Supervisor(a) e Diretor(a) podem visualizar os dados, mas não editam lançamentos.<br>" +
            "Para editar, você precisa estar vinculado(a) a uma turma.");
        return false;
    }

    return true;
}

/**
 * Pode editar ATIVIDADE específica?
 * Admin: tudo. Supervisor/Diretor/Professor: apenas as suas próprias.
 */
function podeEditarAtividade(atividade) {
    if (isAdmin()) return true;
    var u = getUsuarioLogado();
    if (!u) return false;
    return String(atividade.autor_id || "") === String(u.id || "") ||
           (atividade.autor || "").toLowerCase().trim() === (u.nome || "").toLowerCase().trim();
}

/**
 * Pode excluir ATIVIDADE?
 * Supervisor/Diretor podem excluir as próprias — mesmo que anteriormente não pudessem.
 */
function podeExcluirAtividade(atividade) {
    return podeEditarAtividade(atividade);
}

/**
 * Pode editar/excluir ROTINA?
 * Admin: tudo. Supervisor/Diretor/Professor: apenas as suas próprias.
 */
function podeEditarRotina(rotina) {
    if (isAdmin()) return true;
    var u = getUsuarioLogado();
    if (!u) return false;
    return (rotina.professor || "").toLowerCase().trim() === (u.nome || "").toLowerCase().trim();
}

/* ════════════════════════════════════════════════════════════════
   LOGIN
════════════════════════════════════════════════════════════════ */
async function fazerLogin() {
    var loginInput = document.getElementById("login-user");
    var pwdInput   = document.getElementById("login-pwd");
    var errEl      = document.getElementById("login-error");
    var btnEl      = document.getElementById("login-btn");

    var telefone = (loginInput ? loginInput.value : "").trim().replace(/\D/g, "");
    var senha    = (pwdInput   ? pwdInput.value   : "");

    if (!telefone || !senha) {
        errEl.textContent   = "Preencha telefone e senha.";
        errEl.style.display = "block";
        return;
    }

    errEl.style.display    = "none";
    btnEl.disabled         = true;
    btnEl.innerHTML        = "<span class=\"login-loading\"></span> Entrando...";

    /* NÃO usar mostrarLoadingSimples/ocultarLoadingSimples aqui.
       O setTimeout(300ms) interno de ocultarLoadingSimples remove av-visible
       depois que mostrarLoading já o adicionou — race condition idêntico ao da
       restauração de sessão. O botão "Entrando..." já fornece feedback visual
       suficiente durante a verificação de credenciais. */
    var usuario = null;

    try {
        if (window.sbClient && window.sbOnline) {
            usuario = await sbLogin(telefone, senha);
        }

        if (!usuario) {
            var users = JSON.parse(localStorage.getItem("av_users") || "[]");
            var local = users.find(function(u) {
                return u.telefone === telefone && u.senha === senha;
            });
            if (local) { usuario = local; }
        }
    } catch(e) {
        console.warn("[login]", e.message);
    }

    if (!usuario) {
        errEl.textContent   = "Telefone ou senha incorretos.";
        errEl.style.display = "block";
        btnEl.disabled      = false;
        btnEl.innerHTML     = "<i class=\"fas fa-sign-in-alt\"></i> Entrar";
        return;
    }

    localStorage.setItem("usuario_logado", JSON.stringify(usuario));
    /* Aplicar tema do usuário ao fazer login */
    if (usuario.tema) localStorage.setItem("av_tema", usuario.tema);
    if (typeof aplicarTema === "function") {
        aplicarTema(localStorage.getItem("av_tema") || "light");
    }
    aplicarDadosUsuarioHeader(usuario);
    aplicarPermissoesUI(usuario);

    /* Preenche a tela de carregamento com nome e saudação do usuário */
    if (typeof avlPreencherTela === "function") avlPreencherTela(usuario);

    /* Carrega foto do professor do banco (fotos_professores) para todos os dispositivos */
    if (window.sbClient && window.sbOnline && usuario.id) {
        sbCarregarFotoProfessor(usuario.id).then(function(urlPublica) {
            if (urlPublica) {
                cfgAplicarFotoHeader(urlPublica);
                localStorage.setItem("foto_usuario_" + usuario.id, urlPublica);
            }
        }).catch(function() {});
    }

    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("main-app").style.display = "flex";

    btnEl.disabled  = false;
    btnEl.innerHTML = "<i class=\"fas fa-sign-in-alt\"></i> Entrar";

    if (typeof inicializarApp === "function") {
        mostrarLoading("Carregando dados...");
        try {
            await inicializarApp();
        } finally {
            ocultarLoading();
        }
    }
}

function toggleLoginPwd(btn) {
    var inp   = document.getElementById("login-pwd");
    var icone = btn.querySelector("i");
    if (!inp) return;
    inp.type        = inp.type === "password" ? "text" : "password";
    icone.className = inp.type === "password" ? "fas fa-eye" : "fas fa-eye-slash";
}

/* ════════════════════════════════════════════════════════════════
   LOGOUT
════════════════════════════════════════════════════════════════ */
function mostrarModalSair() {
    var m = document.getElementById("modal-sair");
    if (m) { m.style.display = "flex"; m.classList.add("visible"); }
}
function fecharModalSair() {
    var m = document.getElementById("modal-sair");
    if (m) { m.style.display = "none"; m.classList.remove("visible"); }
}
document.addEventListener("DOMContentLoaded", function() {
    var m = document.getElementById("modal-sair");
    if (m) m.addEventListener("click", function(e) { if (e.target === m) fecharModalSair(); });
});

async function fazerLogout() {
    fecharModalSair();
    /* 1. Limpa cache de boas-vindas ANTES de qualquer outra ação
          para garantir que o próximo login comece do zero */
    if (typeof limparCacheLogin === "function") limparCacheLogin();

    /* 2. Telemetria: encerra sessão */
    if (typeof sbTelEncerrarSessao === "function") {
        await sbTelEncerrarSessao("logout");
    }
    localStorage.removeItem("usuario_logado");
    sessionStorage.removeItem("al_selecionado");
    var keysToRemove = [];
    for (var ki = 0; ki < localStorage.length; ki++) {
        var k = localStorage.key(ki);
        if (k && (k.startsWith("alunos_") || k.startsWith("turmas") ||
            /^.+_(DIAG|1BIM|2BIM|3BIM|4BIM)_/.test(k))) {
            keysToRemove.push(k);
        }
    }
    keysToRemove.forEach(function(k) { localStorage.removeItem(k); });

    var lu = document.getElementById("login-user");
    var lp = document.getElementById("login-pwd");
    if (lu) lu.value = "";
    if (lp) lp.value = "";

    document.getElementById("login-screen").classList.remove("hidden");
    document.getElementById("main-app").style.display = "none";
    aplicarPermissoesUI(null);
}

/* ════════════════════════════════════════════════════════════════
   DARK MODE — Toggle, leitura e persistência
════════════════════════════════════════════════════════════════ */

/**
 * Aplica um tema sem animação de transição.
 * Usado na inicialização para evitar flash de troca.
 */
function aplicarTema(tema) {
    /* Desativa transições para a troca ser instantânea */
    document.documentElement.classList.add("no-transition");
    document.documentElement.setAttribute("data-theme", tema);

    /* Sincroniza visual do toggle */
    var toggle = document.getElementById("sb-toggle-dark");
    if (toggle) {
        if (tema === "dark") toggle.classList.add("on");
        else                 toggle.classList.remove("on");
    }

    /* Reativa transições após dois frames (garante que o browser renderizou) */
    requestAnimationFrame(function() {
        requestAnimationFrame(function() {
            document.documentElement.classList.remove("no-transition");
        });
    });
}

/**
 * Lê o tema salvo e aplica na inicialização.
 * Ordem de prioridade:
 *   1. localStorage ("av_tema")
 *   2. Preferência do sistema (prefers-color-scheme)
 *   3. Padrão: "light"
 */
function inicializarTema() {
    var temaSalvo = localStorage.getItem("av_tema");
    if (temaSalvo === "dark" || temaSalvo === "light") {
        aplicarTema(temaSalvo);
        return;
    }
    /* Sem preferência salva — verifica sistema */
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
        aplicarTema("dark");
    } else {
        aplicarTema("light");
    }
}

/**
 * Alterna entre dark e light.
 * Salva em localStorage e sincroniza com Supabase em background.
 */
async function sbToggleDarkMode() {
    var atual = document.documentElement.getAttribute("data-theme") || "light";
    var novo  = atual === "dark" ? "light" : "dark";

    /* Aplica imediatamente — UX responsiva */
    document.documentElement.setAttribute("data-theme", novo);
    localStorage.setItem("av_tema", novo);

    /* Sincroniza toggle visual */
    var toggle = document.getElementById("sb-toggle-dark");
    if (toggle) {
        if (novo === "dark") toggle.classList.add("on");
        else                 toggle.classList.remove("on");
    }

    /* Sincroniza com Supabase em background (sem bloquear a UI) */
    try {
        var u = getUsuarioLogado();
        if (window.sbOnline && window.sbClient && u && u.id) {
            window.sbClient
                .from("app_users")
                .update({ tema: novo })
                .eq("id", u.id)
                .then(function(){})
                .catch(function(e) { console.warn("[tema] Sync falhou:", e.message); });
        }
    } catch(e) { /* silencioso — localStorage já salvou */ }
}

/* ════════════════════════════════════════════════════════════════
   CONTROLE DE UI POR ROLE
════════════════════════════════════════════════════════════════ */
function aplicarPermissoesUI(u) {
    var role = u ? (u.role || u.cargo || "").toLowerCase().trim() : "";
    var ehSupervisorOuDiretor = (role === "supervisora" || role === "supervisor" ||
                                 role === "diretor"     || role === "diretora");
    var ehAdmin = (role === "admin" || role === "administrador");

    /* Configurações: apenas admin */
    var btnCfg = document.getElementById("btn-configuracoes");
    if (btnCfg) btnCfg.style.display = ehAdmin ? "" : "none";

    /* Modo escuro: admin sempre vê, demais usuários só se permissão ativa */
    var btnDark = document.getElementById("btn-darkmode");
    if (btnDark) {
        var temPermDark = (typeof permGetPerm === "function") ? permGetPerm("dark_mode_habilitado") : false;
        btnDark.style.display = (ehAdmin || temPermDark) ? "" : "none";
    }

    /* Botões de adicionar/importar alunos: ocultos para supervisor/diretor */
    var btnAdd = document.getElementById("btn-header-novo");
    var btnImp = document.getElementById("btn-header-import");
    if (btnAdd) btnAdd.style.display = ehSupervisorOuDiretor ? "none" : "";
    if (btnImp) btnImp.style.display = ehSupervisorOuDiretor ? "none" : "";

    /*
     * Modo somente-leitura para lançamentos:
     * Supervisor/Diretor SEM vínculo de turma não devem lançar notas.
     * Se estiver vinculado a turma, o acesso é liberado ao carregar a turma.
     * Por padrão ativamos somente-leitura; é desativado em getTurmasDoUsuario
     * se ele tiver vínculo.
     */
    window._modoSomenteLeitura = ehSupervisorOuDiretor;
}

/* ════════════════════════════════════════════════════════════════
   HEADER — nome, cargo, foto
════════════════════════════════════════════════════════════════ */
function aplicarDadosUsuarioHeader(u) {
    var nomeEl  = document.querySelector("#profileCard .profile-info span");
    var labelEl = document.querySelector("#profileCard .profile-info b");
    var turmaEl = document.getElementById("turmaPerfil");

    var roleLabel = {
        admin:        "Administrador(a)",
        administrador:"Administrador(a)",
        professor:    "Professor(a)",
        supervisora:  "Supervisor(a)",
        supervisor:   "Supervisor(a)",
        diretor:      "Diretor(a)",
        diretora:     "Diretor(a)"
    };

    var role = (u.role || u.cargo || "").toLowerCase().trim();

    if (nomeEl)  nomeEl.innerText  = u.nome || "Usuário";
    if (labelEl) labelEl.innerText = roleLabel[role] || "Usuário";
    if (turmaEl) turmaEl.innerText = "";

    cfgAplicarFotoHeader(u.foto_url || localStorage.getItem("foto_usuario_" + u.id) || null);
}

/* ════════════════════════════════════════════════════════════════
   FOTO
════════════════════════════════════════════════════════════════ */
var cfgFotoDataUrl = null;

function cfgPreviewFoto(input) {
    if (!input.files || !input.files[0]) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        cfgFotoDataUrl = e.target.result;
        var img    = document.getElementById("cfg-foto-preview");
        var icon   = document.getElementById("cfg-foto-icon");
        var delBtn = document.getElementById("cfg-foto-del-btn");
        if (img)    { img.src = cfgFotoDataUrl; img.style.display = "block"; }
        if (icon)   icon.style.display  = "none";
        if (delBtn) delBtn.style.display = "flex";
    };
    reader.readAsDataURL(input.files[0]);
}

function cfgRemoverFoto() {
    cfgFotoDataUrl = null;
    var img    = document.getElementById("cfg-foto-preview");
    var icon   = document.getElementById("cfg-foto-icon");
    var delBtn = document.getElementById("cfg-foto-del-btn");
    var input  = document.getElementById("cfg-foto-input");
    if (img)    { img.src = ""; img.style.display = "none"; }
    if (icon)   icon.style.display  = "block";
    if (delBtn) delBtn.style.display = "none";
    if (input)  input.value = "";
}

function cfgAplicarFotoHeader(dataUrl) {
    var container = document.getElementById("profilePhotoContainer");
    if (!container) return;
    container.innerHTML = dataUrl
        ? "<img src=\"" + dataUrl + "\" style=\"width:100%;height:100%;object-fit:cover;border-radius:50%;\" alt=\"\">"
        : "<i class=\"fas fa-user\"></i>";
}

async function cfgCarregarFotoDoUsuarioLogado() {
    var u = getUsuarioLogado();
    if (!u) return;
    if (u.foto_url) { cfgAplicarFotoHeader(u.foto_url); return; }
    var fotoLocal = localStorage.getItem("foto_usuario_" + u.id);
    if (fotoLocal) cfgAplicarFotoHeader(fotoLocal);
}

