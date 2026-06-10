/* ════════════════════════════════════════════════════════════════
   NOTIFICATIONS.JS — Sistema de notificações e conexão
   Integra com o sistema existente (supabase.js, app.js)
   Sem dependências externas. JS puro.
════════════════════════════════════════════════════════════════ */

/* ── Estilos injetados uma única vez ──────────────────────────── */
(function _injetarEstilos() {
    if (document.getElementById("ntf-styles")) return;
    var s = document.createElement("style");
    s.id = "ntf-styles";
    s.textContent = [
        "#ntf-container {",
        "  position: fixed; bottom: 20px; right: 20px; z-index: 99999;",
        "  display: flex; flex-direction: column; gap: 8px;",
        "  pointer-events: none;",
        "}",
        ".ntf-toast {",
        "  display: flex; align-items: center; gap: 10px;",
        "  padding: 12px 16px; border-radius: 10px;",
        "  font-family: 'Inter', sans-serif; font-size: 14px;",
        "  color: #fff; min-width: 260px; max-width: 360px;",
        "  box-shadow: 0 4px 16px rgba(0,0,0,0.18);",
        "  pointer-events: auto; cursor: default;",
        "  animation: ntf-in 0.25s ease;",
        "  transition: opacity 0.35s ease, transform 0.35s ease;",
        "}",
        ".ntf-toast.ntf-saindo { opacity: 0; transform: translateX(30px); }",
        ".ntf-toast.ntf-success { background: var(--success, #10b981); }",
        ".ntf-toast.ntf-error   { background: var(--danger,  #ef4444); }",
        ".ntf-toast.ntf-warning { background: #f59e0b; }",
        ".ntf-toast.ntf-info    { background: var(--primary, #1e40af); }",
        ".ntf-icon { font-size: 16px; flex-shrink: 0; }",
        ".ntf-msg  { flex: 1; line-height: 1.4; }",
        ".ntf-close {",
        "  background: none; border: none; color: rgba(255,255,255,0.8);",
        "  cursor: pointer; font-size: 16px; padding: 0 0 0 6px;",
        "  line-height: 1; flex-shrink: 0;",
        "}",
        ".ntf-close:hover { color: #fff; }",
        "@keyframes ntf-in {",
        "  from { opacity: 0; transform: translateX(30px); }",
        "  to   { opacity: 1; transform: translateX(0); }",
        "}",
        /* Badge de conexão no header */
        "#ntf-status-badge {",
        "  display: none; align-items: center; gap: 5px;",
        "  font-size: 12px; padding: 3px 10px; border-radius: 20px;",
        "  font-family: 'Inter', sans-serif; font-weight: 500;",
        "  position: fixed; top: 10px; left: 50%; transform: translateX(-50%);",
        "  z-index: 99998; box-shadow: 0 2px 8px rgba(0,0,0,0.15);",
        "  animation: ntf-in 0.25s ease;",
        "}",
        "#ntf-status-badge.ntf-offline { display: flex; background: #ef4444; color: #fff; }",
        "#ntf-status-badge.ntf-online  { display: flex; background: #10b981; color: #fff; }"
    ].join("\n");
    document.head.appendChild(s);
})();

/* ── Container de toasts ──────────────────────────────────────── */
function _ntfContainer() {
    var c = document.getElementById("ntf-container");
    if (!c) {
        c = document.createElement("div");
        c.id = "ntf-container";
        document.body.appendChild(c);
    }
    return c;
}

/* ── Função principal: notify(type, message, duração?) ────────── */
/*
 * Tipos: "success" | "error" | "warning" | "info"
 * Exemplos:
 *   notify("success", "Aluno cadastrado com sucesso!");
 *   notify("error",   "Erro ao salvar. Verifique a conexão.");
 *   notify("warning", "Nenhum aluno encontrado.");
 *   notify("info",    "Sincronização em andamento...");
 */
var _ntfIcons = {
    success: "✓",
    error:   "✕",
    warning: "⚠",
    info:    "ℹ"
};

window.notify = function(tipo, mensagem, duracao) {
    var ms   = (typeof duracao === "number") ? duracao : 4000;
    var icon = _ntfIcons[tipo] || "ℹ";

    var toast = document.createElement("div");
    toast.className = "ntf-toast ntf-" + tipo;
    toast.innerHTML =
        "<span class='ntf-icon'>" + icon + "</span>" +
        "<span class='ntf-msg'>"  + mensagem + "</span>" +
        "<button class='ntf-close' title='Fechar'>✕</button>";

    toast.querySelector(".ntf-close").addEventListener("click", function() {
        _ntfRemover(toast);
    });

    _ntfContainer().appendChild(toast);

    if (ms > 0) {
        setTimeout(function() { _ntfRemover(toast); }, ms);
    }
    return toast;
};

function _ntfRemover(toast) {
    toast.classList.add("ntf-saindo");
    setTimeout(function() {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 380);
}

/* ════════════════════════════════════════════════════════════════
   DETECÇÃO DE CONEXÃO — offline / online
   Usa eventos nativos do browser (sem fetch periódico)
════════════════════════════════════════════════════════════════ */
(function _monitorarConexao() {
    /* Badge central no topo */
    var badge = document.createElement("div");
    badge.id = "ntf-status-badge";
    badge.innerHTML = "<span id='ntf-status-icon'></span><span id='ntf-status-texto'></span>";

    var _badgeTimeout = null;

    function _mostrarBadge(modo) {
        /* Remove classe anterior */
        badge.classList.remove("ntf-offline", "ntf-online");
        clearTimeout(_badgeTimeout);

        if (modo === "offline") {
            document.getElementById("ntf-status-icon").textContent  = "⚠ ";
            document.getElementById("ntf-status-texto").textContent = "Sem conexão — modo offline";
            badge.classList.add("ntf-offline");
            /* Fica visível enquanto offline — remove só ao voltar */
        } else {
            document.getElementById("ntf-status-icon").textContent  = "✓ ";
            document.getElementById("ntf-status-texto").textContent = "Conexão restaurada";
            badge.classList.add("ntf-online");
            /* Esconde após 4s */
            _badgeTimeout = setTimeout(function() {
                badge.classList.remove("ntf-offline", "ntf-online");
            }, 4000);
        }
    }

    /* Aguarda body estar disponível */
    function _anexar() {
        if (document.body) {
            document.body.appendChild(badge);
        } else {
            document.addEventListener("DOMContentLoaded", function() {
                document.body.appendChild(badge);
            });
        }
    }
    _anexar();

    window.addEventListener("offline", function() {
        window.sbOnline = false;
        _mostrarBadge("offline");
        notify("error", "Conexão perdida. Trabalhando offline.", 0); /* 0 = não remove */
    });

    window.addEventListener("online", function() {
        /* Confirma com ping real antes de declarar online */
        fetch("https://aprthgkkzojwklxnoeij.supabase.co/rest/v1/", {
            method: "HEAD",
            cache:  "no-store",
            signal: AbortSignal.timeout(5000)
        }).then(function() {
            window.sbOnline = true;
            /* Fecha todos os toasts de "sem conexão" */
            document.querySelectorAll(".ntf-toast.ntf-error").forEach(function(t) {
                _ntfRemover(t);
            });
            _mostrarBadge("online");
            notify("success", "Conexão restaurada.");
        }).catch(function() {
            /* Navegador diz online mas Supabase não responde — mantém offline */
            notify("warning", "Internet detectada, mas servidor indisponível.");
        });
    });
})();

/* ════════════════════════════════════════════════════════════════
   HELPERS para operações Supabase com feedback automático
   Use estes wrappers nas funções críticas de supabase.js
════════════════════════════════════════════════════════════════ */

/*
 * sbNotify(resultado, mensagemSucesso?, mensagemErro?)
 *
 * Passa o retorno direto do Supabase. Exemplos:
 *
 *   var r = await window.sbClient.from("alunos").insert([payload]).select().single();
 *   if (sbNotify(r, "Aluno cadastrado!", "Erro ao cadastrar aluno.")) { ... }
 *
 *   var r = await window.sbClient.from("matriculas").delete().eq("id", id);
 *   sbNotify(r, null, "Erro ao remover matrícula.");  // null = sem toast de sucesso
 *
 * Retorna: true se OK, false se erro.
 */
window.sbNotify = function(resultado, msgSucesso, msgErro) {
    if (resultado && resultado.error) {
        var erro = resultado.error.message || "Erro desconhecido.";
        var msg  = msgErro ? (msgErro + " (" + erro + ")") : ("Erro: " + erro);
        notify("error", msg);
        console.error("[sbNotify]", erro, resultado.error);
        return false;
    }
    if (msgSucesso) {
        notify("success", msgSucesso);
    }
    return true;
};

/*
 * sbNotifyOnly(error, mensagemErro)
 * Versão mínima — só mostra erro se houver, sem toast de sucesso.
 * Útil para operações silenciosas onde o sucesso é implícito.
 *
 *   if (!sbNotifyOnly(r.error, "Erro ao salvar nota.")) return false;
 */
window.sbNotifyOnly = function(error, msgErro) {
    if (!error) return true;
    var msg = msgErro
        ? (msgErro + " (" + (error.message || error) + ")")
        : ("Erro: " + (error.message || error));
    notify("error", msg);
    console.error("[sbNotifyOnly]", error);
    return false;
};

/* ════════════════════════════════════════════════════════════════
   EXEMPLOS DE INTEGRAÇÃO (comentados — use conforme necessário)
════════════════════════════════════════════════════════════════ */

/*
 * Em configuracoes.js — ao salvar usuário:
 *
 *   var r = await window.sbClient.from("app_users").insert([payload]).select().single();
 *   if (!sbNotify(r, "Usuário cadastrado com sucesso!", "Erro ao cadastrar usuário.")) return;
 *
 * Em supabase.js — ao salvar nota (sbSalvarNota):
 *
 *   var r = await window.sbClient.from("lancamentos")
 *       .upsert([payload], { onConflict: "matricula_id,periodo" }).select().single();
 *   if (!sbNotifyOnly(r.error, "Erro ao salvar nota.")) return false;
 *
 * Em configuracoes.js — ao excluir turma:
 *
 *   var r = await window.sbClient.from("turmas").delete().eq("nome", nome);
 *   sbNotify(r, "Turma excluída.", "Erro ao excluir turma.");
 */
