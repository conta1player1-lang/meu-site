/* ════════════════════════════════════════════════════════════════
   mensagens.js v3.0 — Gerenciador de mensagens de boas-vindas
   ────────────────────────────────────────────────────────────────
   Fonte de dados: Supabase (tabela mensagens_loading).
   Fallback offline: localStorage (av_mensagens_fallback).

   ESTRATÉGIA:
     - Online:  lê mensagens do Supabase, aplica ciclo global
       (menos visualizadas aparecem primeiro — contagem em
       mensagens_visualizadas, válida para todos os usuários)
     - Offline: usa cópia local gravada no último acesso online

   SORTEIO: único, feito em obterMensagem(). loading.js não sorteia.

   API PÚBLICA:
     MensagensGerenciador.obterMensagem(usuario)      → objeto msg
     MensagensGerenciador.registrarExibicao(id, usr)  → persiste
     MensagensGerenciador.obterEstatisticas()         → {total,ativas,totalViz}
     MensagensGerenciador.obterRanking()              → array (localStorage)
     MensagensGerenciador.obterHistorico(n)           → array (localStorage)
     MensagensGerenciador.salvarMensagemPadrao(cfg)   → persiste no SB
     MensagensGerenciador.obterMensagemPadrao()       → objeto | null
     -- CRUD (delegam para supabase.js) --
     MensagensGerenciador.adicionarMensagem(g, txt)
     MensagensGerenciador.editarMensagem(id, txt)
     MensagensGerenciador.removerMensagem(id)
     MensagensGerenciador.toggleAtivo(id)
     MensagensGerenciador.getData()                   → dados para UI
     MensagensGerenciador.resetarCiclo(grupo)         → zera visualizações SB
════════════════════════════════════════════════════════════════ */

var MensagensGerenciador = (function() {

    var FALLBACK_KEY = "av_mensagens_fallback";   /* cache offline */

    /* ════════════════════════════════════════════════════════════
       MAPEAMENTO: periodo (JS) → periodo (banco)
       O banco usa os mesmos nomes; "todas" = raras e lendárias.
    ════════════════════════════════════════════════════════════ */
    var PERIODOS_HORARIO = ["madrugada", "cedo", "manha", "tarde", "noite"];

    /* ────────────────────────────────────────────────────────────
       MENSAGENS PADRÃO EMBUTIDAS
       Usadas apenas quando o banco está offline E não há cache.
    ──────────────────────────────────────────────────────────── */
    var FALLBACK_EMBUTIDO = [
        { id: "fb_man_001", texto: "Hoje é um ótimo dia para acompanhar seus alunos.",       categoria: "normal",  periodo: "manha",     ativo: true },
        { id: "fb_man_002", texto: "Cada criança que lê é um futuro que se abre.",           categoria: "normal",  periodo: "manha",     ativo: true },
        { id: "fb_man_003", texto: "Sua dedicação transforma histórias de vida.",             categoria: "normal",  periodo: "manha",     ativo: true },
        { id: "fb_tar_001", texto: "A tarde é ótima para revisar as próximas atividades.",   categoria: "normal",  periodo: "tarde",     ativo: true },
        { id: "fb_tar_002", texto: "Tarde com foco — seus alunos agradecem.",                categoria: "normal",  periodo: "tarde",     ativo: true },
        { id: "fb_noi_001", texto: "Encerrando o dia com organização. Bom trabalho!",        categoria: "normal",  periodo: "noite",     ativo: true },
        { id: "fb_noi_002", texto: "Noite de dedicação — seus alunos têm sorte de ter você.",categoria: "normal",  periodo: "noite",     ativo: true },
        { id: "fb_mad_001", texto: "Quem trabalha de madrugada merece todo o reconhecimento.",categoria:"normal",  periodo: "madrugada", ativo: true },
        { id: "fb_ced_001", texto: "Nada melhor que um café para começar o dia!",            categoria: "normal",  periodo: "cedo",      ativo: true },
        { id: "fb_rar_001", texto: "🌟 Sua dedicação é coisa de herói.",                    categoria: "rara",    periodo: "todas",     ativo: true },
        { id: "fb_rar_002", texto: "📚 Educador presente: a diferença na vida de uma criança.", categoria: "rara", periodo: "todas",    ativo: true },
        { id: "fb_rar_003", texto: "🔥 A chama da educação nunca apaga quando você está aqui.", categoria: "rara", periodo: "todas",    ativo: true },
        { id: "fb_len_001", texto: "🏆 LENDA DETECTADA! Você é o motivo pelo qual crianças amam a escola.", categoria: "lendaria", periodo: "todas", ativo: true },
        { id: "fb_len_002", texto: "👑 RARIDADE EXTREMA: Poucas entradas são tão especiais quanto a sua.",  categoria: "lendaria", periodo: "todas", ativo: true }
    ];

    /* ════════════════════════════════════════════════════════════
       PROBABILIDADES
         [0 , 80) → horário atual
         [80, 99) → rara
         [99,100) → lendária
    ════════════════════════════════════════════════════════════ */
    var PROB_HORARIO  = 80;
    var PROB_RARAS    = 19;

    /* ── Cache em memória para a sessão atual ── */
    var _cacheMensagens = null;   /* array completo vindo do banco */
    var _cacheContagem  = null;   /* { mensagem_id: n } vindo do banco */

    /* ════════════════════════════════════════════════════════════
       HELPERS
    ════════════════════════════════════════════════════════════ */

    function _getPeriodo() {
        var h = new Date().getHours();
        if (h < 5)  return "madrugada";
        if (h < 7)  return "cedo";
        if (h < 12) return "manha";
        if (h < 18) return "tarde";
        return "noite";
    }

    /* Seleciona a mensagem com menor contagem; sorteio entre empatadas */
    function _selecionarMenosVista(lista, contagem) {
        var ativas = lista.filter(function(m) { return m.ativo !== false; });
        if (!ativas.length) return null;
        var minN = ativas.reduce(function(min, m) {
            return Math.min(min, contagem[m.id] || 0);
        }, Infinity);
        var pool = ativas.filter(function(m) { return (contagem[m.id] || 0) === minN; });
        return pool[Math.floor(Math.random() * pool.length)] || null;
    }

    /* Grava cópia das mensagens no localStorage (fallback offline) */
    function _gravarFallback(msgs) {
        try { localStorage.setItem(FALLBACK_KEY, JSON.stringify(msgs)); } catch(e) {}
    }

    /* Lê fallback local */
    function _lerFallback() {
        try {
            var raw = localStorage.getItem(FALLBACK_KEY);
            return raw ? JSON.parse(raw) : FALLBACK_EMBUTIDO;
        } catch(e) { return FALLBACK_EMBUTIDO; }
    }

    /* Decide se o Supabase está disponível */
    function _sbOnline() {
        return !!(window.sbClient && window.sbOnline);
    }

    /* ════════════════════════════════════════════════════════════
       API PÚBLICA
    ════════════════════════════════════════════════════════════ */

    /*
     * obterMensagem(usuario)
     * ─────────────────────
     * Chamada UMA única vez por login (loading.js cuida disso via _msgCache).
     * 1. Verifica mensagem padrão/evento ativa
     * 2. Sorteia tipo (horário / rara / lendária)
     * 3. Seleciona a menos vista do grupo sorteado
     */
    async function obterMensagem(usuario) {

        /* 1. Mensagem padrão tem prioridade total */
        if (_sbOnline()) {
            try {
                var padrao = await sbMsgObterPadrao();
                if (padrao) {
                    /* Verifica "uma_vez": se ativo, confere se este usuário já viu */
                    var meta = (function() {
                        try { return JSON.parse(localStorage.getItem("av_sys_config") || "{}").aviso_meta || {}; } catch(e) { return {}; }
                    })();
                    var umaVez  = meta.uma_vez !== false; /* default: true */
                    var uid     = usuario && (usuario.id || null);
                    var jaViu   = false;
                    if (umaVez && uid && typeof sbMsgUsuarioJaViu === "function") {
                        jaViu = await sbMsgUsuarioJaViu(padrao.id, uid);
                    }
                    if (!jaViu) {
                        return {
                            id: padrao.id, texto: padrao.texto,
                            tipo: "padrao", isPadrao: true, isRara: false, isLendaria: false
                        };
                    }
                    /* Usuário já viu e uma_vez=true → cai para sorteio normal */
                }
            } catch(e) {}
        }

        /* 2. Carrega mensagens (cache de sessão ou banco) */
        var todasMsgs = _cacheMensagens;
        if (!todasMsgs) {
            if (_sbOnline()) {
                try {
                    todasMsgs = await sbMsgBuscarTodas();
                    if (todasMsgs && todasMsgs.length) {
                        _cacheMensagens = todasMsgs;
                        _gravarFallback(todasMsgs);
                    }
                } catch(e) {}
            }
            if (!todasMsgs || !todasMsgs.length) {
                todasMsgs = _lerFallback();
            }
        }

        /* 3. Carrega contagens de visualizações (ciclo global) */
        var contagem = _cacheContagem;
        if (!contagem && _sbOnline()) {
            try {
                var ids = todasMsgs.map(function(m) { return m.id; });
                contagem = await sbMsgContarVisualizacoes(ids);
                _cacheContagem = contagem;
            } catch(e) {}
        }
        if (!contagem) contagem = {};

        /* 4. UM ÚNICO sorteio */
        var periodo = _getPeriodo();
        var rand    = Math.random() * 100;
        var tipo, filtro;

        if (rand < PROB_HORARIO) {
            tipo   = "horario";
            filtro = function(m) { return m.periodo === periodo && m.ativo !== false; };
        } else if (rand < PROB_HORARIO + PROB_RARAS) {
            tipo   = "raras";
            filtro = function(m) { return m.categoria === "rara" && m.ativo !== false; };
        } else {
            tipo   = "lendarias";
            filtro = function(m) { return m.categoria === "lendaria" && m.ativo !== false; };
        }

        var pool = todasMsgs.filter(filtro);

        /* Fallback: se o pool estiver vazio, usa qualquer mensagem do período */
        if (!pool.length) {
            pool = todasMsgs.filter(function(m) {
                return m.periodo === periodo && m.ativo !== false;
            });
            tipo = "horario";
        }
        if (!pool.length) pool = todasMsgs.filter(function(m) { return m.ativo !== false; });

        var msg = _selecionarMenosVista(pool, contagem);
        if (!msg) {
            return { id: null, texto: "Bem-vindo ao sistema!", tipo: "horario",
                     isLendaria: false, isRara: false, isPadrao: false };
        }

        return {
            id:         msg.id,
            texto:      msg.texto,
            categoria:  msg.categoria,
            tipo:       tipo,
            isLendaria: tipo === "lendarias",
            isRara:     tipo === "raras",
            isPadrao:   false
        };
    }

    /*
     * registrarExibicao(id, usuario)
     * ─────────────────────────────
     * Chamado pelo loading.js ao fechar o modal.
     * - Persiste no Supabase (mensagens_visualizadas)
     * - Invalida cache de contagem para refletir no próximo login
     */
    async function registrarExibicao(id, usuario) {
        /* Invalida cache de contagem (ciclo se atualiza no próximo login) */
        _cacheContagem = null;

        if (!id || id === "padrao") return;
        var uid = usuario && (usuario.id || null);
        if (!uid) return;

        if (_sbOnline()) {
            await sbMsgRegistrarVisualizacao(id, uid);
        }
        /* Também registra no acessos_sistema via telemetria (já iniciado) */
    }

    /* Estatísticas: total, ativas, visualizações */
    async function obterEstatisticas() {
        if (_sbOnline()) {
            var s = await sbMsgEstatisticas();
            if (s) return s;
        }
        /* Fallback offline */
        var msgs = _lerFallback();
        return {
            total:    msgs.length,
            ativas:   msgs.filter(function(m) { return m.ativo !== false; }).length,
            totalViz: 0
        };
    }

    /* getData — retorna mensagens agrupadas por período (para a UI) */
    async function getData() {
        var msgs = _cacheMensagens;
        if (!msgs && _sbOnline()) {
            try { msgs = await sbMsgBuscarTodas(); _cacheMensagens = msgs; } catch(e) {}
        }
        if (!msgs) msgs = _lerFallback();

        /* Agrupa por periodo/categoria */
        var grupos = {
            madrugada: [], cedo: [], manha: [], tarde: [], noite: [],
            raras: [], lendarias: [], padrao: []
        };
        (msgs || []).forEach(function(m) {
            var g;
            if (m.categoria === "rara")     g = "raras";
            else if (m.categoria === "lendaria") g = "lendarias";
            else if (m.categoria === "padrao")   g = "padrao";
            else g = m.periodo;
            if (grupos[g]) grupos[g].push(m);
        });
        return { mensagens: grupos };
    }

    /* Invalida cache de mensagens (após CRUD) */
    function _invalidarCache() {
        _cacheMensagens = null;
        _cacheContagem  = null;
    }

    /* CRUD — delegam para supabase.js e invalidam cache */
    async function adicionarMensagem(grupo, texto) {
        if (!texto || !texto.trim()) return false;
        /* Mapeia grupo UI → categoria + periodo do banco */
        var cat, per;
        if (grupo === "raras")     { cat = "rara";     per = "todas"; }
        else if (grupo === "lendarias") { cat = "lendaria"; per = "todas"; }
        else { cat = "normal"; per = grupo; }

        var ok = !!(await sbMsgCriar({ texto: texto, categoria: cat, periodo: per }));
        if (ok) _invalidarCache();
        return ok;
    }

    async function editarMensagem(id, novoTexto) {
        var ok = await sbMsgEditar(id, { texto: novoTexto });
        if (ok) _invalidarCache();
        return ok;
    }

    async function removerMensagem(id) {
        var ok = await sbMsgExcluir(id);
        if (ok) _invalidarCache();
        return ok;
    }

    async function toggleAtivo(id) {
        /* Busca estado atual e inverte */
        var msgs = _cacheMensagens || _lerFallback();
        var m = msgs.find(function(x) { return x.id === id; });
        var novoAtivo = m ? !m.ativo : true;
        var ok = await sbMsgEditar(id, { ativo: novoAtivo });
        if (ok) _invalidarCache();
        return ok;
    }

    /* Zera visualizações de um grupo (deleta registros do banco) */
    async function resetarCiclo(grupo) {
        if (!_sbOnline()) return;
        try {
            /* Busca IDs do grupo */
            var msgs = await sbMsgBuscarTodas();
            var ids = (msgs || []).filter(function(m) {
                if (grupo === "raras")     return m.categoria === "rara";
                if (grupo === "lendarias") return m.categoria === "lendaria";
                return m.periodo === grupo;
            }).map(function(m) { return m.id; });

            if (ids.length) {
                await window.sbClient.from("mensagens_visualizadas")
                    .delete().in("mensagem_id", ids);
            }
            _invalidarCache();
        } catch(e) { console.warn("[msg] resetarCiclo:", e.message); }
    }

    /* Mensagem padrão/evento */
    /* ── Helpers para metadados do aviso (inicio/fim/uma_vez) no sys_config ── */
    async function _salvarAvisoMeta(meta) {
        try {
            var cfgAtual = {};
            try { cfgAtual = JSON.parse(localStorage.getItem("av_sys_config") || "{}"); } catch(e){}
            cfgAtual.aviso_meta = meta;
            localStorage.setItem("av_sys_config", JSON.stringify(cfgAtual));
            if (_sbOnline() && typeof sbSalvarSysConfig === "function") {
                await sbSalvarSysConfig(cfgAtual);
            }
        } catch(e) { console.warn("[msg] _salvarAvisoMeta:", e.message); }
    }
    function _obterAvisoMeta() {
        try {
            var cfg = JSON.parse(localStorage.getItem("av_sys_config") || "{}");
            return cfg.aviso_meta || {};
        } catch(e) { return {}; }
    }

    async function salvarMensagemPadrao(cfg) {
        if (!cfg || !cfg.texto || !cfg.texto.trim()) return false;
        try {
            if (_sbOnline()) {
                /* Desativa todos os padrão existentes */
                await window.sbClient.from("mensagens_loading")
                    .update({ ativo: false }).eq("categoria", "padrao");
                if (cfg.ativo) {
                    await sbMsgCriar({ texto: cfg.texto, categoria: "padrao", periodo: "todas", ativo: true });
                }
                _invalidarCache();
            }
            /* Persiste metadados (inicio/fim/uma_vez/ativo) em sys_config */
            await _salvarAvisoMeta({
                inicio:  cfg.inicio  || "",
                fim:     cfg.fim     || "",
                uma_vez: cfg.uma_vez !== false,
                ativo:   !!cfg.ativo,
                texto:   cfg.texto.trim()
            });
            return true;
        } catch(e) { console.warn("[msg] salvarMensagemPadrao:", e.message); }
        return false;
    }

    async function descartarMensagemPadrao() {
        try {
            if (_sbOnline()) {
                /* Remove/desativa todos os padrão no Supabase */
                await window.sbClient.from("mensagens_loading")
                    .update({ ativo: false }).eq("categoria", "padrao");
                _invalidarCache();
            }
            /* Limpa metadados no sys_config */
            await _salvarAvisoMeta({});
            return true;
        } catch(e) { console.warn("[msg] descartarMensagemPadrao:", e.message); }
        return false;
    }

    async function obterMensagemPadrao() {
        var meta = _obterAvisoMeta();
        var sb   = _sbOnline() ? await sbMsgObterPadrao() : null;
        /* Se não há registro ativo no Supabase, retorna null (sem aviso ativo) */
        if (!sb && !meta.texto) return null;
        /* Mescla dados do Supabase com metadados locais */
        return {
            id:      sb ? sb.id : null,
            texto:   (sb ? sb.texto : meta.texto) || "",
            ativo:   sb ? !!sb.ativo : !!meta.ativo,
            inicio:  meta.inicio  || "",
            fim:     meta.fim     || "",
            uma_vez: meta.uma_vez !== false,
            lidas:   meta.lidas   || []
        };
    }

    /* restaurarPadrao — não aplicável no modelo Supabase (mensagens vêm do banco) */
    function restaurarPadrao() { return false; }

    /* obterRanking / obterHistorico — mantidos para compatibilidade com configuracoes.js
       A UI agora usa sbTelObterEstatisticas() diretamente */
    async function obterRanking() {
        return await sbMsgRankingVisualizacoes(10);
    }

    function obterHistorico() { return []; }   /* histórico detalhado não implementado nesta versão simples */

    function salvar() {}   /* no-op: persistência é no Supabase */

    return {
        obterMensagem:        obterMensagem,
        registrarExibicao:    registrarExibicao,
        obterEstatisticas:    obterEstatisticas,
        getData:              getData,
        salvar:               salvar,
        resetarCiclo:         resetarCiclo,
        adicionarMensagem:    adicionarMensagem,
        editarMensagem:       editarMensagem,
        removerMensagem:      removerMensagem,
        toggleAtivo:          toggleAtivo,
        restaurarPadrao:      restaurarPadrao,
        salvarMensagemPadrao:   salvarMensagemPadrao,
        obterMensagemPadrao:    obterMensagemPadrao,
        descartarMensagemPadrao: descartarMensagemPadrao,
        obterRanking:         obterRanking,
        obterHistorico:       obterHistorico
    };

})();
