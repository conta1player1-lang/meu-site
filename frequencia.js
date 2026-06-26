/* ════════════════════════════════════════════════════════════════
   MÓDULO DE FREQUÊNCIA — frequencia.js
   Atalho: Ctrl+Shift+F
   Isolado do sistema. Não altera nenhuma funcionalidade existente.
════════════════════════════════════════════════════════════════ */

(function() {
'use strict';

/* ── Constantes ── */
var FREQ_LS_KEY = 'freq_datas_v1';
var MESES_NOME  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                   'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
var MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun',
                   'Jul','Ago','Set','Out','Nov','Dez'];
var MESES_CLS   = ['jan','fev','mar','abr','mai','jun',
                   'jul','ago','set','out','nov','dez'];
var DIAS_SEM    = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

/* ── Estado interno ── */
var freq = {
    abaAtiva:      'frequencia',
    datasLetivasSet: new Set(), /* strings "YYYY-MM-DD" */
    anoAtual:      new Date().getFullYear(),
    mesConfigAtual: new Date().getMonth()
};

/* ═══════════════════════════════════════════
   ABERTURA / FECHAMENTO
═══════════════════════════════════════════ */
function abrirFrequencia() {
    var modal = document.getElementById('modal-frequencia');
    if (!modal) return;
    freq.datasLetivasSet = carregarDatasLS();
    modal.classList.add('freq-aberto');
    document.body.style.overflow = 'hidden';
    renderFrequencia();
    renderConfigDias();
    atualizarInfoDias();
}

function fecharFrequencia() {
    var modal = document.getElementById('modal-frequencia');
    if (!modal) return;
    modal.classList.remove('freq-aberto');
    document.body.style.overflow = '';
}

/* ═══════════════════════════════════════════
   DADOS DO SISTEMA
═══════════════════════════════════════════ */
function getDadosSistema() {
    var u       = (typeof getUsuarioLogado === 'function') ? getUsuarioLogado() : null;
    var cfg     = (typeof sysGetConfig    === 'function') ? sysGetConfig()    : {};
    var turma   = '';
    var periodo = '';
    var periodoLabel = '';

    try { turma = (typeof getTurmaAtual === 'function') ? getTurmaAtual() : ''; } catch(e){}
    try {
        if (typeof getPeriodo === 'function') {
            periodo = getPeriodo();
            var pArr = (typeof periodosArr !== 'undefined') ? periodosArr : [];
            var pObj = pArr.find(function(p){ return p.v === periodo; });
            periodoLabel = pObj ? pObj.t : periodo;
        }
    } catch(e){}

    var alunos = [];
    try {
        if (typeof getAlunos === 'function') alunos = getAlunos(periodo, turma) || [];
    } catch(e){}

    return {
        escola:       cfg.escola   || 'Escola',
        professor:    u ? (u.nome || u.name || 'Professor') : 'Professor',
        turma:        turma        || '—',
        periodo:      periodo,
        periodoLabel: periodoLabel || periodo || '—',
        alunos:       alunos,
        ano:          cfg.ano      || new Date().getFullYear()
    };
}

function getChaveLS() {
    var d = getDadosSistema();
    var t = (d.turma || 'geral').replace(/[^a-zA-Z0-9]/g,'_');
    var p = (d.periodo || 'geral');
    return FREQ_LS_KEY + '_' + t + '_' + p;
}

/* ═══════════════════════════════════════════
   PERSISTÊNCIA (localStorage apenas)
═══════════════════════════════════════════ */
function carregarDatasLS() {
    try {
        var raw = localStorage.getItem(getChaveLS());
        if (!raw) return new Set();
        return new Set(JSON.parse(raw));
    } catch(e) { return new Set(); }
}

function salvarDatasLS() {
    try {
        localStorage.setItem(getChaveLS(), JSON.stringify(Array.from(freq.datasLetivasSet)));
    } catch(e) {}
}

/* ═══════════════════════════════════════════
   RENDER — TABELA DE FREQUÊNCIA
═══════════════════════════════════════════ */
function renderFrequencia() {
    var d = getDadosSistema();

    /* Cards informativos — só preenche se vazio ou padrão (preserva edição do usuário) */
    var el = function(id){ return document.getElementById(id); };
    function _preencherSeVazio(id, valor) {
        var elem = el(id);
        if (!elem) return;
        var atual = (elem.textContent || '').trim();
        if (atual === '' || atual === '—') elem.textContent = valor;
    }
    _preencherSeVazio('freq-val-escola',  d.escola);
    _preencherSeVazio('freq-val-prof',    d.professor);
    _preencherSeVazio('freq-val-turma',   d.turma);
    _preencherSeVazio('freq-val-periodo', d.periodoLabel);
    atualizarInfoDias();

    /* Tabela */
    var wrap = document.getElementById('freq-table-wrap');
    if (!wrap) return;

    /* Ordena as datas letivas */
    var datas = Array.from(freq.datasLetivasSet).sort();

    var html = '<table class="freq-table">';

    /* ── cabeçalho ── */
    html += '<thead><tr>';
    html += '<th class="freq-th-main freq-th-num">Nº</th>';
    html += '<th class="freq-th-main freq-th-aluno">ALUNOS</th>';

    datas.forEach(function(dataStr) {
        var partes = dataStr.split('-');
        var dia  = parseInt(partes[2]);
        var mes  = parseInt(partes[1]) - 1; /* 0-based */
        var cls  = 'freq-mes-' + MESES_CLS[mes];
        html += '<th class="freq-th-dia ' + cls + '">'
             +  '<span class="freq-dia-num">' + String(dia).padStart(2,'0') + '</span>'
             +  '<span class="freq-dia-mes">' + MESES_ABREV[mes] + '</span>'
             +  '</th>';
    });
    html += '</tr></thead>';

    /* ── corpo ── */
    html += '<tbody>';
    if (d.alunos.length === 0) {
        html += '<tr><td colspan="' + (datas.length + 2) + '" style="padding:24px;text-align:center;color:#94a3b8;font-size:13px;font-weight:600;">Nenhum aluno encontrado para esta turma/período.</td></tr>';
    } else {
        d.alunos.forEach(function(nome, i) {
            html += '<tr>';
            html += '<td class="freq-td-num">' + String(i+1).padStart(2,'0') + '</td>';
            html += '<td class="freq-td-aluno">' + nome + '</td>';
            datas.forEach(function() {
                html += '<td class="freq-td-celula"></td>';
            });
            html += '</tr>';
        });
    }
    html += '</tbody></table>';

    wrap.innerHTML = html;
}

/* ═══════════════════════════════════════════
   RENDER — CALENDÁRIOS CONFIGURAÇÃO
═══════════════════════════════════════════ */
function renderConfigDias() {
    var container = document.getElementById('freq-calendarios');
    if (!container) return;

    var ano = freq.anoAtual;
    var html = '';

    for (var m = 0; m < 12; m++) {
        var clsMes = 'freq-mes-' + MESES_CLS[m];
        html += '<div class="freq-cal-mes">';
        html += '<div class="freq-cal-mes-header ' + clsMes + '" style="background:none;padding:10px 14px;">'
             +  '<span style="display:block;font-size:12px;font-weight:800;color:#1e293b;">' + MESES_NOME[m] + '</span>'
             +  '<span style="font-size:10px;font-weight:500;color:#64748b;">' + ano + '</span>'
             +  '</div>';
        html += '<div class="freq-cal-grid">';

        /* Dias da semana */
        DIAS_SEM.forEach(function(d) {
            html += '<div class="freq-cal-dow">' + d + '</div>';
        });

        /* Dias do mês */
        var primeiroDia = new Date(ano, m, 1).getDay(); /* 0=Dom */
        var totalDias   = new Date(ano, m+1, 0).getDate();

        /* Células vazias antes do 1º dia */
        for (var v = 0; v < primeiroDia; v++) {
            html += '<button class="freq-cal-dia vazio" disabled></button>';
        }

        for (var d2 = 1; d2 <= totalDias; d2++) {
            var dataStr  = ano + '-' + String(m+1).padStart(2,'0') + '-' + String(d2).padStart(2,'0');
            var diaSem   = new Date(ano, m, d2).getDay();
            var fimSem   = (diaSem === 0 || diaSem === 6);
            var selec    = freq.datasLetivasSet.has(dataStr);
            var clsDia   = 'freq-cal-dia';
            if (fimSem) clsDia += ' fim-semana';
            if (selec)  clsDia += ' selecionado';
            html += '<button class="' + clsDia + '" data-data="' + dataStr + '" '
                 +  (fimSem ? 'disabled' : 'onclick="freqToggleData(\'' + dataStr + '\')"')
                 +  '>' + d2 + '</button>';
        }

        html += '</div></div>';
    }

    container.innerHTML = html;
    atualizarInfoDias();
}

/* ═══════════════════════════════════════════
   INTERAÇÃO — TOGGLE DATA
═══════════════════════════════════════════ */
window.freqToggleData = function(dataStr) {
    if (freq.datasLetivasSet.has(dataStr)) {
        freq.datasLetivasSet.delete(dataStr);
    } else {
        freq.datasLetivasSet.add(dataStr);
    }
    salvarDatasLS();

    /* Atualiza botão no calendário */
    var btn = document.querySelector('[data-data="' + dataStr + '"]');
    if (btn) btn.classList.toggle('selecionado', freq.datasLetivasSet.has(dataStr));

    atualizarInfoDias();
    /* Atualiza tabela se aba ativa for frequência */
    if (freq.abaAtiva === 'frequencia') renderFrequencia();
};

function atualizarInfoDias() {
    var n = freq.datasLetivasSet.size;
    var el = document.getElementById('freq-val-dias');
    if (el) el.textContent = n + ' dia' + (n !== 1 ? 's' : '');
    var el2 = document.getElementById('freq-total-dias');
    if (el2) el2.textContent = n + ' dia' + (n !== 1 ? 's' : '') + ' letivo' + (n !== 1 ? 's' : '') + ' selecionado' + (n !== 1 ? 's' : '');
}

/* ═══════════════════════════════════════════
   ABAS
═══════════════════════════════════════════ */
window.freqMudarAba = function(aba) {
    freq.abaAtiva = aba;
    document.querySelectorAll('.freq-tab').forEach(function(t) {
        t.classList.toggle('ativa', t.dataset.aba === aba);
    });
    document.querySelectorAll('.freq-aba').forEach(function(a) {
        a.classList.toggle('ativa', a.dataset.aba === aba);
    });
    if (aba === 'frequencia') renderFrequencia();
};

/* ═══════════════════════════════════════════
   LIMPAR DATAS
═══════════════════════════════════════════ */
window.freqLimparDatas = function() {
    if (!confirm('Remover todos os dias letivos selecionados?')) return;
    freq.datasLetivasSet.clear();
    salvarDatasLS();
    renderConfigDias();
    renderFrequencia();
    freqToast('Dias letivos removidos.');
};

/* ═══════════════════════════════════════════
   IMPRESSÃO
═══════════════════════════════════════════ */
window.freqImprimir = function() {
    if (freq.datasLetivasSet.size === 0) {
        freqToast('Configure os dias letivos primeiro.');
        return;
    }
    freqMudarAba('frequencia');
    /* Adiciona classe que ativa o CSS de impressão da frequência */
    document.body.classList.add('freq-imprimindo');
    setTimeout(function() {
        window.print();
        /* Remove a classe após a impressão (afterprint ou fallback) */
        var remover = function() {
            document.body.classList.remove('freq-imprimindo');
            window.removeEventListener('afterprint', remover);
        };
        window.addEventListener('afterprint', remover);
        /* Fallback: remove após 3s caso afterprint não dispare */
        setTimeout(remover, 3000);
    }, 120);
};

/* ═══════════════════════════════════════════
   TOAST
═══════════════════════════════════════════ */
function freqToast(msg) {
    var t = document.getElementById('freq-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('visivel');
    setTimeout(function() { t.classList.remove('visivel'); }, 2500);
}

/* ═══════════════════════════════════════════
   ATALHO Ctrl+Shift+F
═══════════════════════════════════════════ */
document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault();
        var modal = document.getElementById('modal-frequencia');
        if (!modal) return;
        if (modal.classList.contains('freq-aberto')) {
            fecharFrequencia();
        } else {
            abrirFrequencia();
        }
    }
    /* ESC fecha o modal */
    if (e.key === 'Escape') {
        var modal2 = document.getElementById('modal-frequencia');
        if (modal2 && modal2.classList.contains('freq-aberto')) fecharFrequencia();
    }
});

/* ═══════════════════════════════════════════
   LONG PRESS — botão "Novo aluno" por 5s abre frequência
═══════════════════════════════════════════ */
(function() {
    var _lpTimer   = null;
    var _lpAtivo   = false;
    var _LP_MS     = 5000; /* 5 segundos */

    function _lpIniciar(e) {
        _lpAtivo = false;
        _lpTimer = setTimeout(function() {
            _lpAtivo = true;
            abrirFrequencia();
            _feedbackLongPress();
        }, _LP_MS);
    }

    function _lpCancelar() {
        if (_lpTimer) { clearTimeout(_lpTimer); _lpTimer = null; }
    }

    function _feedbackLongPress() {
        /* Vibração tátil no mobile */
        if (navigator.vibrate) navigator.vibrate([60, 30, 60]);
    }

    function _attachLongPress() {
        var btn = document.getElementById('btn-header-novo');
        if (!btn) return;
        btn.addEventListener('touchstart',  _lpIniciar,  { passive: true });
        btn.addEventListener('touchend',    _lpCancelar);
        btn.addEventListener('touchcancel', _lpCancelar);
        btn.addEventListener('mousedown',   _lpIniciar);
        btn.addEventListener('mouseup',     _lpCancelar);
        btn.addEventListener('mouseleave',  _lpCancelar);
        /* Impede o clique normal de disparar se foi long press */
        btn.addEventListener('click', function(e) {
            if (_lpAtivo) { e.stopImmediatePropagation(); e.preventDefault(); _lpAtivo = false; }
        }, true);
    }

    /* Aguarda o DOM estar pronto */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _attachLongPress);
    } else {
        setTimeout(_attachLongPress, 800);
    }
})();

/* ═══════════════════════════════════════════
   EXPÕE FUNÇÕES GLOBAIS
═══════════════════════════════════════════ */
window.abrirFrequencia  = abrirFrequencia;
window.fecharFrequencia = fecharFrequencia;

})();
