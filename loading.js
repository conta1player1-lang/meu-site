/* ════════════════════════════════════════════════════════════════
   loading.js v4.2
   ────────────────────────────────────────────────────────────────
   DOIS MODOS de exibição:

   1. mostrarLoading(texto) — BOAS-VINDAS (login / troca de ano)
      Exibe o modal completo com saudação, frase e barra.
      Faz sorteio de mensagem UMA ÚNICA VEZ por sessão de login.
      Só deve ser chamado por: usuarios.js (login) e app.js (trocarAno).

   2. mostrarLoadingSimples(texto) — OPERAÇÕES INTERNAS
      Exibe overlay leve sem sorteio, sem saudação, sem alterar cache.
      Para: importar alunos, salvar config, restaurar, etc.

   FIX v4.2:
     - _msgCache e _usuarioCache são limpos em limparCacheLogin()
     - limparCacheLogin() chamado pelo logout antes de qualquer outra ação
     - mostrarLoadingSimples não toca em _msgCache nem em _usuarioCache

   API GLOBAL:
     mostrarLoading(texto)          — boas-vindas (login/ano)
     ocultarLoading()
     mostrarLoadingSimples(texto)   — operações internas
     ocultarLoadingSimples()
     ocultarLoadingForcar()
     limparCacheLogin()             — chamado no logout
     mostrarLoadingLocal(el)
     ocultarLoadingLocal(el)
════════════════════════════════════════════════════════════════ */

(function() {

    /* ── Etapas de carregamento ── */
    var _etapas = [
        "Preparando informações...",
        "Verificando turmas...",
        "Carregando lançamentos...",
        "Organizando relatórios...",
        "Finalizando detalhes..."
    ];

    /* ── Estado interno ── */
    var _refCount   = 0;
    var _visivel    = false;
    var _abrindoAt  = 0;
    var _MIN_MS     = 10000;
    var _hideTimer  = null;
    var _showTimer  = null;
    var _pctTimer   = null;
    var _msgTimer   = null;
    var _pctAtual   = 0;
    var _msgIdx     = 0;

    /*
     * _msgCache: guarda o resultado do sorteio feito na PRIMEIRA chamada a
     * mostrarLoading() de cada sessão de login. Chamadas subsequentes
     * (ex: mostrarLoading("Carregando dados...")) reutilizam este cache
     * em vez de sortear novamente, eliminando o bug de duplo sorteio.
     */
    var _msgCache   = null;
    var _usuarioCache = null;

    /* ── Elementos DOM ── */
    function _el()    { return document.getElementById("av-loading"); }
    function _elTxt() { return document.getElementById("av-loading-txt"); }
    function _elBar() { return document.getElementById("avl-progress-bar"); }
    function _elPct() { return document.getElementById("avl-pct"); }

    /* ── Saudação ── */
    function _getSaudacao() {
        var h = new Date().getHours();
        if (h < 5)  return { txt: "BOA MADRUGADA",      emoji: "🌙" };
        if (h < 7)  return { txt: "O DIA COMEÇOU CEDO", emoji: "☕" };
        if (h < 12) return { txt: "BOM DIA",             emoji: "☀️" };
        if (h < 18) return { txt: "BOA TARDE",           emoji: "🌤️" };
        return               { txt: "BOA NOITE",          emoji: "🌙" };
    }

    /*
     * _preencherSaudacaoImediata(usuario)
     * ────────────────────────────────────
     * Preenche APENAS nome e saudação horária assim que o modal abre.
     * Não aguarda Supabase. Garante que o usuário veja seu nome na hora.
     */
    function _preencherSaudacaoImediata(usuario) {
        var s    = _getSaudacao();
        var nome = (usuario && (usuario.nome || usuario.name || "")) || "";
        var primeiro = nome.trim().split(" ")[0] || "";

        var elOla   = document.getElementById("avl-saudacao");
        var elPer   = document.getElementById("avl-periodo-txt");
        var elEmoji = document.getElementById("avl-periodo-emoji");

        if (elOla)   elOla.textContent   = primeiro ? "OLÁ, " + primeiro.toUpperCase() + "!" : "OLÁ!";
        if (elPer)   elPer.textContent   = s.txt;
        if (elEmoji) elEmoji.textContent = s.emoji;
    }

    /*
     * _preencherFrase(msg)
     * ─────────────────────
     * Preenche APENAS a frase motivacional e o ícone.
     * Chamado quando a Promise do Supabase resolve.
     */
    function _preencherFrase(msg) {
        if (!msg) return;
        var elFrase = document.getElementById("avl-frase-txt");
        var elIco   = document.getElementById("avl-frase-ico");
        var elCard  = document.querySelector(".avl-frase-box");

        var icone = msg.isPadrao ? "📢" : (msg.isLendaria ? "👑" : (msg.isRara ? "🏆" : "💡"));
        if (elIco) elIco.textContent = icone;

        if (elFrase) {
            elFrase.style.opacity = "0";
            setTimeout(function() {
                if (elFrase) { elFrase.textContent = msg.texto || ""; elFrase.style.opacity = "1"; }
            }, 200);
        }

        if (elCard) {
            elCard.classList.remove("avl-frase-rara", "avl-frase-lendaria", "avl-frase-padrao");
            if (msg.isPadrao)        elCard.classList.add("avl-frase-padrao");
            else if (msg.isLendaria) elCard.classList.add("avl-frase-lendaria");
            else if (msg.isRara)     elCard.classList.add("avl-frase-rara");
        }
    }

    /*
     * _preencherTela(usuario, msg)
     * ────────────────────────────
     * Mantida para compatibilidade. Chama as duas funções acima.
     */
    function _preencherTela(usuario, msg) {
        _preencherSaudacaoImediata(usuario);
        _preencherFrase(msg);
    }
    /* Exposto para compatibilidade com usuarios.js */
    window.avlPreencherTela = function(usuario) {
        _usuarioCache = usuario;
        if (_msgCache) _preencherTela(usuario, _msgCache);
    };

    /* Limpa completamente o cache entre logins — chamado pelo fazerLogout() */
    window.limparCacheLogin = function() {
        _msgCache     = null;
        _usuarioCache = null;

        /* Zera imediatamente os campos visíveis do modal para que nenhum
           dado do usuário anterior apareça no próximo login, mesmo que o
           modal abra antes de _preencherSaudacaoImediata ser chamado. */
        var elOla   = document.getElementById("avl-saudacao");
        var elPer   = document.getElementById("avl-periodo-txt");
        var elEmoji = document.getElementById("avl-periodo-emoji");
        var elFrase = document.getElementById("avl-frase-txt");
        var elIco   = document.getElementById("avl-frase-ico");
        if (elOla)   elOla.textContent   = "";
        if (elPer)   elPer.textContent   = "";
        if (elEmoji) elEmoji.textContent = "";
        if (elFrase) elFrase.textContent = "";
        if (elIco)   elIco.textContent   = "";
    };

    /* ── Animação de % fluida (ease-out cúbico, ~33fps) ── */
    function _animarPct(destino, duracaoMs) {
        if (_pctTimer) { clearInterval(_pctTimer); _pctTimer = null; }
        var inicio = _pctAtual; var delta = destino - inicio;
        if (delta <= 0) return;
        var intervalo = 30; var passos = Math.ceil(duracaoMs / intervalo); var count = 0;
        _pctTimer = setInterval(function() {
            count++;
            var eased = 1 - Math.pow(1 - count / passos, 3);
            _pctAtual = Math.min(destino, Math.round(inicio + delta * eased));
            var bar = _elBar(); var pct = _elPct();
            if (bar) bar.style.width = _pctAtual + "%";
            if (pct) pct.textContent = _pctAtual + "%";
            if (count >= passos) { _pctAtual = destino; clearInterval(_pctTimer); _pctTimer = null; }
        }, intervalo);
    }

    /* ── Etapas com fade ── */
    function _iniciarEtapas() {
        _msgIdx = 0; _trocarEtapa();
    }
    function _trocarEtapa() {
        if (_msgTimer) { clearTimeout(_msgTimer); _msgTimer = null; }
        var elTxt = _elTxt();
        if (elTxt) {
            elTxt.style.opacity = "0";
            setTimeout(function() {
                if (elTxt) { elTxt.textContent = _etapas[_msgIdx % _etapas.length]; elTxt.style.opacity = "1"; }
            }, 200);
        }
        _msgIdx++;
        var intervalo = Math.floor(_MIN_MS / _etapas.length) - 100;
        if (_msgIdx < _etapas.length) _msgTimer = setTimeout(_trocarEtapa, intervalo);
    }

    /* ── Sequência de progresso (10s) ── */
    function _sequenciaProgresso() {
        _pctAtual = 0;
        var bar = _elBar(); if (bar) bar.style.width = "0%";
        var pct = _elPct(); if (pct) pct.textContent = "0%";
        [
            { d: 15, dur: 600,  delay: 0    },
            { d: 32, dur: 900,  delay: 1800 },
            { d: 55, dur: 1000, delay: 3800 },
            { d: 72, dur: 800,  delay: 5800 },
            { d: 88, dur: 900,  delay: 7500 }
        ].forEach(function(e) { setTimeout(function() { _animarPct(e.d, e.dur); }, e.delay); });
    }

    /* ════════════════════════════════════════════════════════════
       API GLOBAL
    ════════════════════════════════════════════════════════════ */

    window.mostrarLoading = function(texto) {
        _refCount++;

        /* Usa apenas o usuário já injetado — nunca lê localStorage aqui
           para evitar mostrar dados de sessão anterior */
        var usuario = _usuarioCache;

        /*
         * SORTEIO ÚNICO (async):
         * obterMensagem() consulta o Supabase — é async.
         * O modal abre imediatamente; a mensagem preenche ao resolver.
         * Chamadas subsequentes reutilizam _msgCache sem novo sorteio.
         */
        if (_visivel) { _msgIdx = 0; return; }
        if (_showTimer) { clearTimeout(_showTimer); _showTimer = null; }

        _showTimer = setTimeout(function() {
            _showTimer = null;
            if (_refCount <= 0) return;
            var el = _el(); if (!el) return;

            /*
             * Limpa campos do modal ANTES de torná-lo visível.
             * Isso evita que conteúdo residual da sessão anterior
             * (nome antigo, frase antiga) apareça por um frame antes
             * de ser sobrescrito — eliminando o "flash do usuário anterior".
             * A frase fica vazia até obterMensagem() resolver (sem fallback visível).
             */
            var _elOlaC   = document.getElementById("avl-saudacao");
            var _elPerC   = document.getElementById("avl-periodo-txt");
            var _elEmojiC = document.getElementById("avl-periodo-emoji");
            var _elFraseC = document.getElementById("avl-frase-txt");
            var _elIcoC   = document.getElementById("avl-frase-ico");
            if (_elFraseC) _elFraseC.textContent = "";
            if (_elIcoC)   _elIcoC.textContent   = "";

            _abrindoAt = Date.now();
            _visivel   = true;
            el.classList.add("av-visible");
            _sequenciaProgresso();
            _iniciarEtapas();

            /*
             * SAUDAÇÃO IMEDIATA: preenche nome + período assim que o modal
             * abre, sem esperar o Supabase. A frase motivacional chega depois
             * via Promise. Isso garante que o usuário veja seu nome na hora.
             */
            if (usuario) {
                _preencherSaudacaoImediata(usuario);
            } else {
                /* Sem usuário: zera campos de saudação para evitar nome residual */
                if (_elOlaC)   _elOlaC.textContent   = "OLÁ!";
                if (_elPerC)   _elPerC.textContent   = _getSaudacao().txt;
                if (_elEmojiC) _elEmojiC.textContent = _getSaudacao().emoji;
            }

            if (!_msgCache && typeof MensagensGerenciador !== "undefined") {
                Promise.resolve(MensagensGerenciador.obterMensagem(usuario)).then(function(msg) {
                    _msgCache = msg || { id: null, texto: "Bem-vindo ao sistema!", tipo: "horario", isLendaria: false, isRara: false };
                    /* Preenche a frase motivacional quando chegar do Supabase */
                    if (usuario && _msgCache) _preencherFrase(_msgCache);
                }).catch(function() {
                    _msgCache = { id: null, texto: "Bem-vindo ao sistema!", tipo: "horario", isLendaria: false, isRara: false };
                    if (usuario) _preencherFrase(_msgCache);
                });
            } else if (_msgCache) {
                /* Cache já existe — preenche a frase imediatamente */
                _preencherFrase(_msgCache);
            }
        }, 80);
    };

    window.ocultarLoading = function() {
        _refCount = Math.max(0, _refCount - 1);
        if (_refCount > 0) return;
        _refCount = 0;
        if (_showTimer) { clearTimeout(_showTimer); _showTimer = null; _visivel = false; return; }
        if (!_visivel) return;
        var decorrido = Date.now() - _abrindoAt;
        var restante  = Math.max(0, _MIN_MS - decorrido);
        if (_hideTimer) clearTimeout(_hideTimer);
        _hideTimer = setTimeout(function() { _hideTimer = null; _concluirEFechar(); }, restante);
    };

    window.ocultarLoadingForcar = function() {
        _refCount = 0; _visivel = false;
        if (_showTimer) { clearTimeout(_showTimer); _showTimer = null; }
        if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }
        if (_pctTimer)  { clearInterval(_pctTimer);  _pctTimer  = null; }
        if (_msgTimer)  { clearTimeout(_msgTimer);   _msgTimer  = null; }
        var el = _el(); if (el) el.classList.remove("av-visible");
    };

    /* ── Conclusão: 100% → registra exibição → fecha ── */
    function _concluirEFechar() {
        /* Registra exibição: passa usuário para histórico e ranking */
        if (typeof MensagensGerenciador !== "undefined" && _msgCache && _msgCache.id) {
            MensagensGerenciador.registrarExibicao(_msgCache.id, _usuarioCache);
        }

        /* Libera cache para o próximo login */
        _msgCache     = null;
        _usuarioCache = null;

        _animarPct(100, 400);
        setTimeout(function() {
            var elTxt = _elTxt(); var elPct = _elPct();
            if (_msgTimer) { clearTimeout(_msgTimer); _msgTimer = null; }
            if (elTxt) {
                elTxt.style.opacity = "0";
                setTimeout(function() {
                    if (elTxt) {
                        elTxt.textContent = "Tudo pronto! Bom trabalho hoje 🚀";
                        elTxt.style.color = "#1d4ed8"; elTxt.style.fontWeight = "700";
                        elTxt.style.opacity = "1";
                    }
                }, 200);
            }
            if (elPct) { elPct.textContent = "100%"; elPct.style.color = "#1d4ed8"; }
        }, 420);

        setTimeout(function() {
            var el = _el();
            if (el) {
                el.classList.add("av-saindo");
                setTimeout(function() {
                    el.classList.remove("av-visible", "av-saindo");
                    _visivel = false; _pctAtual = 0;
                    var elTxt = _elTxt(); var elPct = _elPct();
                    if (elTxt) { elTxt.style.color = ""; elTxt.style.fontWeight = ""; elTxt.style.opacity = ""; }
                    if (elPct) { elPct.style.color = ""; }
                    var elCard = document.querySelector(".avl-frase-box");
                    if (elCard) elCard.classList.remove("avl-frase-rara", "avl-frase-lendaria", "avl-frase-padrao");
                }, 500);
            }
        }, 1500);
    }

    /* ════════════════════════════════════════════════════════════
       LOADING SIMPLES — operações internas (sem boas-vindas)
    ════════════════════════════════════════════════════════════ */
    var _simpleCount = 0;
    var _simpleTimer = null;

    window.mostrarLoadingSimples = function(texto) {
        _simpleCount++;
        var el = _el(); if (!el) return;
        if (_visivel) return; /* não interrompe modal de boas-vindas */
        var elTxt = _elTxt(); var bar = _elBar(); var elPct = _elPct();
        var elOla   = document.getElementById("avl-saudacao");
        var elPer   = document.getElementById("avl-periodo-txt");
        var elEmoji = document.getElementById("avl-periodo-emoji");
        var elFrase = document.getElementById("avl-frase-txt");
        var elIco   = document.getElementById("avl-frase-ico");
        /* Simples nunca sobrescreve a saudação pessoal — deixa em branco neutro */
        if (elOla)   elOla.textContent   = "";
        if (elPer)   elPer.textContent   = "";
        if (elEmoji) elEmoji.textContent = "";
        if (elFrase) elFrase.textContent = texto || "Processando...";
        if (elIco)   elIco.textContent   = "⚙️";
        if (elTxt)   elTxt.textContent   = texto || "Processando...";
        if (elPct)   elPct.textContent   = "";
        if (bar)     bar.style.width     = "0%";
        el.classList.add("av-visible");
        var pct = 0;
        if (_simpleTimer) clearInterval(_simpleTimer);
        _simpleTimer = setInterval(function() {
            pct = Math.min(88, pct + 4);
            if (bar) bar.style.width = pct + "%";
        }, 120);
    };

    window.ocultarLoadingSimples = function() {
        _simpleCount = Math.max(0, _simpleCount - 1);
        if (_simpleCount > 0) return;
        if (_simpleTimer) { clearInterval(_simpleTimer); _simpleTimer = null; }
        var el = _el(); if (!el) return;
        var bar = _elBar(); if (bar) bar.style.width = "100%";
        setTimeout(function() {
            el.classList.remove("av-visible");
            var b2 = _elBar(); if (b2) b2.style.width = "0%";
            var p2 = _elPct(); if (p2) p2.textContent = "";
        }, 300);
    };

    /* ════════════════════════════════════════════════════════════
       LOCAL — spinners dentro de containers
    ════════════════════════════════════════════════════════════ */
    window.mostrarLoadingLocal = function(elOuId) {
        var el = typeof elOuId === "string" ? document.getElementById(elOuId) : elOuId;
        if (!el) return;
        if (!el.querySelector(".av-local-spinner")) {
            var sp = document.createElement("div"); sp.className = "av-local-spinner";
            if (window.getComputedStyle(el).position === "static") el.style.position = "relative";
            el.appendChild(sp);
        }
        el.classList.add("av-local-loading", "av-local-visible");
    };
    window.ocultarLoadingLocal = function(elOuId) {
        var el = typeof elOuId === "string" ? document.getElementById(elOuId) : elOuId;
        if (!el) return;
        el.classList.remove("av-local-visible");
        setTimeout(function() {
            el.classList.remove("av-local-loading");
            var sp = el.querySelector(".av-local-spinner"); if (sp) sp.remove();
        }, 160);
    };

})();
