/* ════════════════════════════════════════════════════════════════
   configuracoes.js v3.0 -- Sem Supabase Auth
   Login por telefone + senha. Roles: admin | professor | supervisora
   Vinculo professor <-> turmas via tabela professor_turmas
   A.V. Leitura+
════════════════════════════════════════════════════════════════ */

var CFG_USERS_KEY        = "av_users";
var cfgFotoEditandoLogin = null;
var cfgEditandoId        = null;

/* ════════════════════════════════════════════════════════════════
   INICIALIZACAO
════════════════════════════════════════════════════════════════ */
async function cfgIniciar() {
    /* Somente admin acessa configuracoes */
    if (!isAdmin()) {
        mostrarModalAviso("Sem permissao", "Apenas administradores acessam as configuracoes.");
        trocarAba("lancamentos", null);
        return;
    }
    cfgPopularTurmasCheck();
    await cfgCarregarUsuarios();
    await cfgCarregarTurmas();
    sysCarregarDados();
}

function cfgTrocarSecao(nome, btn) {
    document.querySelectorAll(".cfg-section").forEach(function(s) { s.classList.remove("active"); });
    document.querySelectorAll(".cfg-nav-item").forEach(function(b) { b.classList.remove("active"); });
    var sec = document.getElementById("cfg-sec-" + nome);
    if (sec) sec.classList.add("active");
    if (btn) btn.classList.add("active");
    if (nome === "usuarios")  cfgCarregarUsuarios();
    if (nome === "turmas")    cfgCarregarTurmas();
    if (nome === "sistema")   sysCarregarDados();
    if (nome === "anoletivo") alInicializar();
    if (nome === "mensagens")  msgInicializar();
    if (nome === "permissoes") { if (typeof permCarregar === "function") permCarregar(); }
}

/* ════════════════════════════════════════════════════════════════
   LOCALSTORAGE -- cache leve (sem senha, sem foto)
════════════════════════════════════════════════════════════════ */
function cfgGetUsers() {
    return JSON.parse(localStorage.getItem(CFG_USERS_KEY) || "[]");
}

function cfgSalvarUsersLocal(lista) {
    try {
        var leve = lista.map(function(u) {
            return {
                id:       u.id       || null,
                nome:     u.nome     || "",
                telefone: u.telefone || "",
                role:     u.role     || "professor",
                turmas:   u.turmas   || [],
                ultimo:   u.ultimo   || u.ultimo_acesso || null
                /* foto e senha omitidos */
            };
        });
        localStorage.setItem(CFG_USERS_KEY, JSON.stringify(leve));
    } catch(e) {
        if (e.name === "QuotaExceededError") {
            console.warn("[cfg] localStorage cheio -- limpando...");
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (k && k.startsWith("foto_usuario_")) localStorage.removeItem(k);
            }
            try { localStorage.setItem(CFG_USERS_KEY, JSON.stringify([])); } catch(e2) {}
        }
    }
}

/* ════════════════════════════════════════════════════════════════
   FORMULARIO DE CADASTRO / EDICAO
════════════════════════════════════════════════════════════════ */
function cfgPopularTurmasCheck() {
    var container = document.getElementById("cfg-turmas-check");
    if (!container) return;
    var turmas = getTurmasStorage();
    var anoSel = typeof alGetAnoSelecionado === "function" ? alGetAnoSelecionado() : null;
    var anoLabel = anoSel ? " — " + anoSel.ano : "";
    var header = "<div style='font-size:10px;color:#94a3b8;margin-bottom:8px;font-weight:600;letter-spacing:.4px;text-transform:uppercase;'>"
        + "<i class='fas fa-calendar-alt' style='margin-right:4px;color:#3b82f6;'></i>"
        + "Turmas do Ano Letivo" + anoLabel
        + "</div>";
    if (turmas.length === 0) {
        container.innerHTML = header + "<div style='font-size:12px;color:#94a3b8;padding:8px 0;'>"
            + "<i class='fas fa-info-circle' style='margin-right:5px;'></i>"
            + "Nenhuma turma cadastrada para este ano letivo.</div>";
        return;
    }
    /* Cada turma: checkbox de vínculo + radio titular/apoio */
    container.innerHTML = header + turmas.map(function(t) {
        var id    = (typeof t === "object") ? t.id   : t;
        var nome  = (typeof t === "object") ? t.nome : t;
        var turno = (typeof t === "object" && t.turno) ? t.turno : "";
        var label = nome + (turno ? ' <small style="color:#94a3b8;font-size:10px;">' + turno + "</small>" : "");
        var uid   = "vt_" + String(id).replace(/[^a-z0-9]/gi,"_");
        return "<div class='cfg-turma-vinculo-row' id='row_"+uid+"'>"
            + "<label class='cfg-turma-chip' style='margin-bottom:0;'>"
            + "<input type='checkbox' class='cfg-turma-cb' value='"+id+"' onchange='cfgToggleTipoVinculo(this,\""+uid+"\")'> "+label+"</label>"
            + "<div class='cfg-tipo-vinculo' id='tipo_"+uid+"' style='display:none;margin-left:12px;display:none;align-items:center;gap:10px;font-size:11px;'>"
            + "<label style='display:flex;align-items:center;gap:4px;cursor:pointer;'>"
            + "<input type='radio' name='vt_"+uid+"' value='titular' checked> <span style='color:#1d4ed8;font-weight:700;'>Titular</span></label>"
            + "<label style='display:flex;align-items:center;gap:4px;cursor:pointer;'>"
            + "<input type='radio' name='vt_"+uid+"' value='apoio'> <span style='color:#64748b;'>Apoio</span></label>"
            + "</div>"
            + "</div>";
    }).join("");
}

/* Mostra/oculta seletor titular/apoio ao marcar/desmarcar turma */
function cfgToggleTipoVinculo(cb, uid) {
    var div = document.getElementById("tipo_" + uid);
    if (!div) return;
    div.style.display = cb.checked ? "flex" : "none";
}

/* Retorna array de {id, tipo_vinculo} das turmas marcadas no formulário */
function cfgGetTurmasComTipo() {
    var resultado = [];
    document.querySelectorAll("#cfg-turmas-check .cfg-turma-cb:checked").forEach(function(cb) {
        var uid    = "vt_" + String(cb.value).replace(/[^a-z0-9]/gi,"_");
        var radios = document.querySelectorAll("input[name='vt_"+uid+"']");
        var tipo   = "titular";
        radios.forEach(function(r){ if (r.checked) tipo = r.value; });
        resultado.push({ id: cb.value, tipo_vinculo: tipo });
    });
    return resultado;
}

function cfgLimparForm() {
    ["cfg-nome","cfg-telefone","cfg-senha","cfg-senha2"].forEach(function(id) {
        var el = document.getElementById(id); if (el) el.value = "";
    });
    var roleEl = document.getElementById("cfg-funcao"); if (roleEl) roleEl.value = "";
    /* Desmarcar todos os checkboxes e ocultar radios */
    document.querySelectorAll("#cfg-turmas-check .cfg-turma-cb").forEach(function(cb) {
        cb.checked = false;
        var uid = "vt_" + String(cb.value).replace(/[^a-z0-9]/gi,"_");
        var div = document.getElementById("tipo_" + uid);
        if (div) div.style.display = "none";
    });
    cfgRemoverFoto();
    cfgFotoEditandoLogin = null;
    cfgEditandoId        = null;
    var h4  = document.querySelector("#cfg-sec-registrar .cfg-form-card h4");
    if (h4) h4.innerHTML = "<i class=\"fas fa-id-card\" style=\"color:var(--secondary);\"></i> Dados do usuario";
    var btn = document.querySelector("[onclick=\"cfgSalvarUsuario()\"]");
    if (btn) btn.innerHTML = "<i class=\"fas fa-save\"></i> Cadastrar";
    var telInput = document.getElementById("cfg-telefone");
    if (telInput) telInput.disabled = false;
}

function cfgTogglePwd(idInput, btn) {
    var inp = document.getElementById(idInput); if (!inp) return;
    inp.type = inp.type === "password" ? "text" : "password";
    btn.querySelector("i").className = inp.type === "password" ? "fas fa-eye" : "fas fa-eye-slash";
}

async function cfgSalvarUsuario() {
    var nome     = (document.getElementById("cfg-nome")     || {}).value || "";
    var telefone = (document.getElementById("cfg-telefone") || {}).value || "";
    var role     = (document.getElementById("cfg-funcao")   || {}).value || "";
    var senha    = (document.getElementById("cfg-senha")    || {}).value || "";
    var senha2   = (document.getElementById("cfg-senha2")   || {}).value || "";
    var turmas   = cfgGetTurmasComTipo(); /* [{id, tipo_vinculo}] */
    var tel      = telefone.replace(/\D/g, "");

    if (!nome || !tel || !role) {
        mostrarModalAviso("Campos obrigatorios", "Preencha nome, telefone e funcao."); return;
    }

    var editando = !!cfgEditandoId;

    if (!editando) {
        if (!senha)           { mostrarModalAviso("Campos obrigatorios", "Informe a senha."); return; }
        if (senha !== senha2) { mostrarModalAviso("Erro", "As senhas nao coincidem."); return; }
        if (senha.length < 6) { mostrarModalAviso("Erro", "Senha minima: 6 caracteres."); return; }

        /* Verificar duplicidade local */
        if (cfgGetUsers().find(function(u) { return u.telefone === tel; })) {
            mostrarModalAviso("Telefone ja existe", "O telefone " + tel + " ja esta cadastrado."); return;
        }
        /* Verificar no banco */
        if (window.sbOnline && await sbTelefoneExiste(tel)) {
            mostrarModalAviso("Telefone ja existe", "O telefone " + tel + " ja esta no banco."); return;
        }
    }

    /* ── NOVO USUARIO ── */
    if (!editando) {
        var btn = document.querySelector("[onclick=\"cfgSalvarUsuario()\"]");
        if (btn) { btn.disabled = true; btn.innerHTML = "<i class=\"fas fa-spinner fa-spin\"></i> Cadastrando..."; }

        var criado = null;
        if (window.sbOnline) {
            criado = await sbCriarUsuario({
                nome:     nome,
                telefone: tel,
                senha:    senha,
                role:     role,
                turmas:   turmas,
                foto_url: null  /* foto salva separado em fotos_professores */
            });
        }

        var local = cfgGetUsers();
        local.push({
            id:       criado ? criado.id : "local_" + Date.now(),
            nome:     nome,
            telefone: tel,
            role:     role,
            turmas:   turmas,
            ultimo:   null
        });
        cfgSalvarUsersLocal(local);

        if (btn) { btn.disabled = false; btn.innerHTML = "<i class=\"fas fa-save\"></i> Cadastrar"; }

        /* Salvar foto no Supabase (tabela fotos_professores) */
        if (cfgFotoDataUrl && criado) {
            await sbSalvarFotoProfessor(criado.id, cfgFotoDataUrl);
        }

        cfgLimparForm();
        await cfgCarregarUsuarios();
        mostrarModalAviso(criado ? "Cadastrado!" : "Salvo localmente",
            criado ? "Professor cadastrado com sucesso." : "Salvo offline. Sincronize quando conectado.");
        return;
    }

    /* ── EDICAO ── */
    if (editando) {
        var fotoAtual = cfgFotoDataUrl || localStorage.getItem("foto_usuario_" + cfgEditandoId) || null;

        if (window.sbOnline && isUUID(cfgEditandoId)) {
            await sbAtualizarUsuario(cfgEditandoId, {
                nome:     nome,
                role:     role,
                telefone: tel,
                foto_url: null, /* foto salva separado em fotos_professores */
                turmas:   turmas,
                senha:    senha || undefined
            });
        }

        var localEd = cfgGetUsers();
        var idxEd   = localEd.findIndex(function(u) { return u.id === cfgEditandoId; });
        if (idxEd >= 0) {
            localEd[idxEd].nome   = nome;
            localEd[idxEd].role   = role;
            localEd[idxEd].turmas = turmas;
        }
        cfgSalvarUsersLocal(localEd);

        if (fotoAtual) await sbSalvarFotoProfessor(cfgEditandoId, fotoAtual);

        cfgLimparForm();
        await cfgCarregarUsuarios();
        mostrarModalAviso("Atualizado!", "Alteracoes salvas com sucesso.");
    }
}

/* ════════════════════════════════════════════════════════════════
   LISTAR USUARIOS
════════════════════════════════════════════════════════════════ */
async function cfgCarregarUsuarios() {
    var users = [];
    if (window.sbOnline) {
        var remoto = await sbBuscarUsuarios();
        if (remoto && remoto.length >= 0) {
            users = remoto;
            cfgSalvarUsersLocal(remoto);
        }
    } else {
        users = cfgGetUsers();
    }
    cfgRenderizarUsuarios(users);
}

function cfgRenderizarUsuarios(users) {
    var tbody = document.getElementById("cfg-users-tbody");
    if (!tbody) return;

    if (!users || users.length === 0) {
        tbody.innerHTML = "<tr><td colspan=\"7\" style=\"text-align:center;color:#94a3b8;padding:24px;\">Nenhum usuario cadastrado</td></tr>";
        return;
    }

    var roleLabel = { admin: "Administrador(a)", professor: "Professor(a)", supervisora: "Supervisor(a)", supervisor: "Supervisor(a)", diretor: "Diretor(a)", diretora: "Diretor(a)" };
    var roleClass = { admin: "role-admin", professor: "role-prof", supervisora: "role-super", supervisor: "role-super", diretor: "role-super", diretora: "role-super" };

    tbody.innerHTML = users.map(function(u) {
        var foto    = u.foto_url || localStorage.getItem("foto_usuario_" + u.id) || null;
        var fotoEl  = foto
            ? "<span class=\"cfg-user-avatar\"><img src=\"" + foto + "\" alt=\"\"></span>"
            : "<span class=\"cfg-user-avatar\"><i class=\"fas fa-user\"></i></span>";
        var rc  = roleClass[u.role] || "role-prof";
        var rl  = roleLabel[u.role] || u.role || "Professor";
        var ul  = (u.ultimo_acesso || u.ultimo)
            ? new Date(u.ultimo_acesso || u.ultimo).toLocaleDateString("pt-BR") : "--";
        var tel = u.telefone || "--";

        return "<tr>"
            + "<td>" + fotoEl + "</td>"
            + "<td style=\"font-weight:600;\">"   + u.nome + "</td>"
            + "<td style=\"color:#64748b;\">"      + tel    + "</td>"
            + "<td><span class=\"cfg-role-badge " + rc + "\">" + rl + "</span></td>"
            + "<td></td>"  /* turmas -- exibidas no edit */
            + "<td class=\"cfg-last-access\">" + ul + "</td>"
            + "<td style=\"text-align:center;\"><div class=\"cfg-action-btns\">"
            + "<button title=\"Editar\" onclick=\"cfgEditarUsuario('" + (u.id||"") + "')\"><i class=\"fas fa-pen\"></i></button>"
            + "<button class=\"del\" title=\"Excluir\" onclick=\"cfgExcluirUsuario('" + (u.id||"") + "')\"><i class=\"fas fa-trash\"></i></button>"
            + "</div></td></tr>";
    }).join("");
}

async function cfgEditarUsuario(id) {
    /* Buscar dados no banco ou local */
    var u = null;
    if (window.sbOnline && isUUID(id)) {
        var remoto = await sbBuscarUsuarios();
        if (remoto) u = remoto.find(function(x) { return x.id === id; });
    }
    if (!u) u = cfgGetUsers().find(function(x) { return x.id === id; });
    if (!u) return;

    cfgEditandoId        = id;
    cfgFotoEditandoLogin = u.telefone || id;
    cfgTrocarSecao("registrar", document.getElementById("cfg-btn-registrar"));

    /* Preencher campos */
    var nomeEl = document.getElementById("cfg-nome");     if (nomeEl) nomeEl.value = u.nome || "";
    var telEl  = document.getElementById("cfg-telefone"); if (telEl)  { telEl.value = u.telefone || ""; telEl.disabled = true; }
    var roleEl = document.getElementById("cfg-funcao");   if (roleEl) roleEl.value = u.role || "";
    var pwdEl  = document.getElementById("cfg-senha");    if (pwdEl)  pwdEl.value = "";
    var pw2El  = document.getElementById("cfg-senha2");   if (pw2El)  pw2El.value = "";

    /* Buscar turmas vinculadas COM tipo_vinculo */
    var turmasVinculadas = []; /* [{nome|id, tipo_vinculo}] */
    if (window.sbOnline && isUUID(id)) {
        var tv = await sbBuscarTurmasDoProfessor(id);
        if (tv && tv.length > 0) turmasVinculadas = tv; /* já vêm com tipo_vinculo do banco */
    } else {
        turmasVinculadas = (u.turmas || []).map(function(t) {
            return typeof t === "object" ? t : { id: t, nome: t, tipo_vinculo: "titular" };
        });
    }

    /* Marcar checkboxes e selecionar tipo de vínculo */
    document.querySelectorAll("#cfg-turmas-check .cfg-turma-cb").forEach(function(cb) {
        var vinculo = turmasVinculadas.find(function(tv) {
            var tvId   = typeof tv === "object" ? (tv.id || tv.nome) : tv;
            var tvNome = typeof tv === "object" ? tv.nome : tv;
            return cb.value === tvId || cb.value === tvNome || turmasVinculadas.map(function(x){ return x.nome||x; }).includes(cb.value);
        });
        if (vinculo) {
            cb.checked = true;
            var uid  = "vt_" + String(cb.value).replace(/[^a-z0-9]/gi,"_");
            var div  = document.getElementById("tipo_" + uid);
            if (div) div.style.display = "flex";
            var tipo = (typeof vinculo === "object" ? vinculo.tipo_vinculo : null) || "titular";
            var radios = document.querySelectorAll("input[name='vt_"+uid+"']");
            radios.forEach(function(r) { r.checked = r.value === tipo; });
        }
    });

    /* Foto */
    cfgFotoDataUrl = u.foto_url || localStorage.getItem("foto_usuario_" + id) || null;
    if (cfgFotoDataUrl) {
        var img = document.getElementById("cfg-foto-preview");
        var ico = document.getElementById("cfg-foto-icon");
        var del = document.getElementById("cfg-foto-del-btn");
        if (img) { img.src = cfgFotoDataUrl; img.style.display = "block"; }
        if (ico) ico.style.display  = "none";
        if (del) del.style.display  = "flex";
    }

    var h4  = document.querySelector("#cfg-sec-registrar .cfg-form-card h4");
    if (h4) h4.innerHTML = "<i class=\"fas fa-pen\" style=\"color:var(--secondary);\"></i> Editar: " + u.nome;
    var btn = document.querySelector("[onclick=\"cfgSalvarUsuario()\"]");
    if (btn) btn.innerHTML = "<i class=\"fas fa-save\"></i> Salvar alteracoes";
}

async function cfgExcluirUsuario(id) {
    mostrarModalConfirmacao("Excluir usuario", "Tem certeza que deseja excluir este usuario?", async function() {
        if (window.sbOnline && isUUID(id)) await sbDeletarUsuario(id);
        cfgSalvarUsersLocal(cfgGetUsers().filter(function(u) { return u.id !== id; }));
        localStorage.removeItem("foto_usuario_" + id);
        await cfgCarregarUsuarios();
        mostrarModalAviso("Excluido", "Usuario removido com sucesso.");
    });
}

/* ════════════════════════════════════════════════════════════════
   TURMAS
════════════════════════════════════════════════════════════════ */
async function cfgCarregarTurmas() {
    var turmas = [];
    if (window.sbOnline) {
        var remoto = await sbBuscarTurmas();
        if (remoto && remoto.length >= 0) {
            /* Preserva todos os campos (nome, turno, id, oculta) ao salvar localmente */
            turmas = remoto;
            salvarTurmasStorage(turmas.map(function(t) {
                return { id: t.id, nome: t.nome, turno: t.turno || "Matutino",
                         ano_letivo_id: t.ano_letivo_id, oculta: t.oculta === true };
            }));
            inicializarTurmas();
        }
    } else {
        turmas = getTurmasStorage();
    }
    cfgRenderizarTurmas(turmas);
}

function cfgRenderizarTurmas(turmas) {
    var tbody = document.getElementById("cfg-turmas-tbody");
    if (!tbody) return;
    if (!turmas) turmas = getTurmasStorage();

    tbody.innerHTML = turmas.map(function(t) {
        var nome   = (typeof t === "object") ? t.nome  : t;
        var turno  = (typeof t === "object" && t.turno)  ? t.turno  : "Matutino";
        var oculta = (typeof t === "object" && t.oculta === true);
        var max    = Math.max.apply(null, [0].concat(periodosArr.map(function(p) {
            return (JSON.parse(localStorage.getItem("alunos_" + nome + "_" + p.v)) || []).length;
        })));
        var nomeEsc = nome.replace(/&/g,"&amp;").replace(/"/g,"&quot;");
        var badgeOculta = oculta
            ? "<span style=\"display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:2px 8px;border-radius:99px;background:#fef3c7;color:#92400e;font-weight:600;\">"
              + "<i class=\"fas fa-eye-slash\"></i> Oculta</span>"
            : "<span style=\"display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:2px 8px;border-radius:99px;background:#dcfce7;color:#166534;font-weight:600;\">"
              + "<i class=\"fas fa-eye\"></i> Visível</span>";
        var toggleTitle = oculta ? "Tornar visível" : "Ocultar turma";
        var toggleIcon  = oculta ? "fa-eye" : "fa-eye-slash";
        return "<tr>"
            + "<td><div style=\"font-weight:600;\">" + nome + "</div>"
            +     "<div style=\"font-size:11px;color:#94a3b8;margin-top:2px;\">" + turno + "</div></td>"
            + "<td>" + (max > 0 ? max : 0) + " aluno(s)</td>"
            + "<td style=\"text-align:center;\">" + badgeOculta + "</td>"
            + "<td style=\"text-align:center;\"><div class=\"cfg-action-btns\">"
            + "<button title=\"" + toggleTitle + "\" data-nome=\"" + nomeEsc + "\" data-oculta=\"" + (oculta ? "1" : "0") + "\" onclick=\"cfgToggleOcultarTurmaBt(this)\">"
            +     "<i class=\"fas " + toggleIcon + "\"></i></button>"
            + "<button class=\"del\" data-nome=\"" + nomeEsc + "\" onclick=\"cfgExcluirTurmaBt(this)\">"
            +     "<i class=\"fas fa-trash\"></i></button>"
            + "</div></td></tr>";
    }).join("");
}

async function cfgAdicionarTurma() {
    /* Bloquear em modo histórico — exceto admin */
    if (typeof alPodeEditar === "function" && !alPodeEditar()) {
        var selCfg = typeof alGetAnoSelecionado === "function" ? alGetAnoSelecionado() : null;
        mostrarModalAviso("Modo histórico", "Não é possível criar turmas no Ano Letivo " + (selCfg ? selCfg.ano : "anterior") + ".");
        return;
    }
    var inpNome  = document.getElementById("cfg-turma-nome");
    var inpTurno = document.getElementById("cfg-turma-turno");
    var nome   = inpNome  ? inpNome.value.trim() : "";
    var turno  = inpTurno ? inpTurno.value : "Matutino";
    var inpOculta = document.getElementById("cfg-turma-oculta");
    var oculta = inpOculta ? inpOculta.checked : false;

    if (!nome) { mostrarModalAviso("Campo obrigatorio", "Digite o nome da turma."); return; }

    /* CORREÇÃO 5: bloqueia criação de turma sem ano letivo ativo.
       Turmas com ano_letivo_id = null causam divergência: sbResolverTurmaId
       nunca as encontra quando há um ano letivo selecionado, quebrando o
       cadastro de alunos e o sync de lançamentos silenciosamente. */
    var anoId = typeof alGetAnoSelecionadoId === "function" ? alGetAnoSelecionadoId() : null;
    if (!anoId) {
        mostrarModalAviso(
            "Ano letivo não selecionado",
            "Selecione um ano letivo ativo antes de criar uma turma.<br><br>"
            + "Vá em <strong>Configurações → Ano Letivo</strong> e ative ou selecione o ano atual."
        );
        return;
    }

    var turmas = getTurmasStorage();
    var jaExiste = turmas.some(function(t) {
        var tn = (typeof t === "object") ? t.nome  : t;
        var tt = (typeof t === "object") ? t.turno : "";
        return tn === nome && tt === turno;
    });
    if (jaExiste) {
        mostrarModalAviso("Turma ja existe", '"' + nome + ' - ' + turno + '" ja esta cadastrada.'); return;
    }

    /* CORREÇÃO 4: turma só existe no sistema se existir no Supabase.
       Antes, a turma era adicionada ao localStorage mesmo quando o INSERT falhava.
       Isso criava turmas "fantasma" que não eram encontradas por sbResolverTurmaId,
       quebrando o cadastro de alunos silenciosamente. */
    if (!window.sbOnline) {
        mostrarModalAviso(
            "Sem conexão",
            "Não é possível criar turmas sem conexão com o banco de dados.<br>"
            + "Verifique sua conexão e tente novamente."
        );
        return;
    }

    var r = await sbAdicionarTurma(nome, turno, oculta);
    if (!r) {
        mostrarModalAviso(
            "Erro ao criar turma",
            "Não foi possível salvar a turma <strong>" + nome + "</strong> no banco de dados.<br>"
            + "A turma NÃO foi criada. Tente novamente."
        );
        return;
    }

    var novaObj = { id: r.id, nome: nome, turno: turno, oculta: oculta,
                    ano_letivo_id: r.ano_letivo_id || anoId };

    /* Reseta o checkbox após adicionar */
    if (inpOculta) inpOculta.checked = false;
    turmas.push(novaObj);
    salvarTurmasStorage(turmas);
    if (inpNome) inpNome.value = "";

    inicializarTurmas();
    cfgRenderizarTurmas(turmas);
    cfgPopularTurmasCheck();
    if (typeof rotPopularTurmas === "function") rotPopularTurmas();
    mostrarModalAviso("Turma adicionada", '"' + nome + ' - ' + turno + '" cadastrada com sucesso.');
}

/* Wrapper seguro para toggle oculta */
async function cfgToggleOcultarTurmaBt(btn) {
    var nome        = btn.getAttribute("data-nome");
    var ocultaAtual = btn.getAttribute("data-oculta") === "1";
    var novoEstado  = !ocultaAtual;
    if (!nome) return;

    /* Atualiza no banco */
    if (window.sbOnline && typeof sbToggleOcultarTurma === "function") {
        mostrarLoadingSimples(novoEstado ? "Ocultando turma..." : "Tornando turma visível...");
        var ok = await sbToggleOcultarTurma(nome, novoEstado);
        ocultarLoadingSimples();
        if (!ok) { mostrarModalAviso("Erro", "Não foi possível alterar a visibilidade da turma."); return; }
    }

    /* Atualiza localStorage */
    var turmas = getTurmasStorage();
    turmas = turmas.map(function(t) {
        var n = (typeof t === "object") ? t.nome : t;
        if (n === nome) {
            if (typeof t === "object") { t.oculta = novoEstado; return t; }
            return { nome: t, oculta: novoEstado };
        }
        return t;
    });
    salvarTurmasStorage(turmas);

    /* Atualiza seletor e re-renderiza tabela */
    inicializarTurmas();
    cfgRenderizarTurmas(turmas);
}

/* Wrapper seguro — lê nome via data-nome evitando interpolação no onclick */
function cfgExcluirTurmaBt(btn) {
    var nome = btn.getAttribute("data-nome");
    if (nome) cfgExcluirTurma(nome);
}

async function cfgExcluirTurma(nome) {
    /* Bloquear em modo histórico — exceto admin */
    if (typeof alPodeEditar === "function" && !alPodeEditar()) {
        var selCfgEx = typeof alGetAnoSelecionado === "function" ? alGetAnoSelecionado() : null;
        mostrarModalAviso("Modo histórico", "Não é possível excluir turmas do Ano Letivo " + (selCfgEx ? selCfgEx.ano : "anterior") + ".");
        return;
    }
    var turmas = getTurmasStorage();
    mostrarModalConfirmacao("Excluir turma", "Excluir \"" + nome + "\"? Todos os alunos, lançamentos e rotinas vinculadas serão removidos.", async function() {
        /* 1. Remover do banco */
        if (window.sbOnline) await sbDeletarTurma(nome);

        /* 2. Limpar localStorage — TODAS as chaves relacionadas a esta turma */
        _limparLocalStorageTurma(nome);

        /* 3. FIX: filtrar por nome extraído corretamente (suporte a string e objeto) */
        var novas = turmas.filter(function(t) {
            var n = (typeof t === "object") ? t.nome : t;
            return n !== nome;
        });
        salvarTurmasStorage(novas);

        /* 4. Atualizar UI */
        inicializarTurmas();
        cfgRenderizarTurmas(novas);
        cfgPopularTurmasCheck();
        if (typeof rotPopularTurmas === "function") rotPopularTurmas();
        mostrarModalAviso("Excluida", "Turma \"" + nome + "\" removida.");
    });
}

/**
 * Remove TODAS as chaves do localStorage relacionadas a uma turma.
 * Chamada antes de deletar a turma para evitar ressuscitar dados.
 * Chaves afetadas:
 *   alunos_TURMA_PERIODO
 *   TURMA_PERIODO_NOMES_HAB_N
 */
function _limparLocalStorageTurma(nomeTurma) {
    var keysParaRemover = [];
    for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k) continue;
        /* chave começa com "alunos_TURMA_" */
        if (k.startsWith("alunos_" + nomeTurma + "_")) keysParaRemover.push(k);
        /* chave começa com "TURMA_PERIODO_" (notas de habilidades) */
        if (k.startsWith(nomeTurma + "_")) keysParaRemover.push(k);
    }
    keysParaRemover.forEach(function(k) { localStorage.removeItem(k); });
    console.log("[limparLocalStorage] Removidas", keysParaRemover.length, "chaves para turma:", nomeTurma);
}
/* ════════════════════════════════════════════════════════════════
   ANOS LETIVOS — configuracoes.js
════════════════════════════════════════════════════════════════ */

var _alAnos = []; /* cache local */

/* Inicializa quando a seção é aberta */
async function alInicializar() {
    alRenderizarLista([]);
    document.getElementById("al-lista").innerHTML =
        "<div class='al-loading'><i class='fas fa-spinner fa-spin'></i> Carregando...</div>";
    var anos = await sbBuscarAnosLetivos();
    _alAnos = anos || [];
    alRenderizarLista(_alAnos);
    alAtualizarBadgeHeader();
}

/* Renderiza a lista de anos */
function alRenderizarLista(anos) {
    var cont = document.getElementById("al-lista");
    if (!cont) return;
    if (!anos || anos.length === 0) {
        cont.innerHTML = "<div class='al-vazio'><i class='fas fa-calendar-plus'></i> Nenhum ano letivo cadastrado.</div>";
        return;
    }
    cont.innerHTML = anos.map(function(a) {
        var ativo = a.ativo ? " ativo" : "";
        var badge = a.ativo ? "<span class='al-badge-ativo'><i class='fas fa-check'></i> Ativo</span>" : "";
        var periodo = "";
        if (a.data_ini || a.data_fim) {
            var ini = a.data_ini ? _alFmtData(a.data_ini) : "?";
            var fim = a.data_fim ? _alFmtData(a.data_fim) : "?";
            periodo = "<div class='al-periodo'><i class='fas fa-calendar-range' style='margin-right:4px;'></i>" + ini + " – " + fim + "</div>";
        }
        var btnDel = a.ativo ? "" :
            "<button class='al-btn-del' onclick='alDeletarAno(\"" + a.id + "\",\"" + (a.ano||a.descricao) + "\")' title='Excluir'><i class='fas fa-trash'></i></button>";
        return "<div class='al-item" + ativo + "' id='al-item-" + a.id + "'>"
            + "<div class='al-radio' onclick='alAtivarAno(\"" + a.id + "\")'></div>"
            + "<div class='al-info'>"
            + "<div class='al-ano-num'>" + (a.ano || "–") + "</div>"
            + "<div class='al-desc'>" + (a.descricao || "Ano Letivo " + a.ano) + "</div>"
            + periodo
            + "</div>"
            + badge
            + btnDel
            + "</div>";
    }).join("");
}

/* Criar novo ano */
async function alCriarAno() {
    var ano  = parseInt(document.getElementById("al-ano").value);
    var desc = document.getElementById("al-descricao").value.trim();
    var ini  = document.getElementById("al-data-ini").value;
    var fim  = document.getElementById("al-data-fim").value;

    if (!ano || ano < 2020 || ano > 2040) {
        mostrarModalAviso("Campo obrigatório", "Informe um ano válido (ex: 2026)."); return;
    }
    if (_alAnos.find(function(a){ return a.ano === ano; })) {
        mostrarModalAviso("Ano já existe", "O Ano Letivo " + ano + " já foi cadastrado."); return;
    }

    var payload = {
        ano:       ano,
        descricao: desc || ("Ano Letivo " + ano),
        data_ini:  ini  || null,
        data_fim:  fim  || null,
        ativo:     false
    };

    /* Pergunta se quer copiar estrutura do ano anterior */
    var anoAnterior = _alAnos.find(function(a){ return a.ativo; }) || (_alAnos.length ? _alAnos[0] : null);
    if (anoAnterior) {
        _alPendingPayload  = payload;
        _alPendingAnoBase  = anoAnterior;
        _alMostrarModalCopiar(anoAnterior, ano);
    } else {
        await _alFinalizarCriacao(payload, null);
    }
}

var _alPendingPayload = null;
var _alPendingAnoBase = null;

function _alMostrarModalCopiar(anoBase, anoNovo) {
    var html = "<div style='font-size:13px;color:#334155;margin-bottom:14px;'>"
        + "Deseja copiar a estrutura de <strong>" + anoBase.ano + "</strong> para <strong>" + anoNovo + "</strong>?"
        + "</div>"
        + "<div style='display:flex;flex-direction:column;gap:10px;'>"
        + "<label style='display:flex;align-items:center;gap:9px;font-size:13px;cursor:pointer;'>"
        +   "<input type='checkbox' id='al-cp-turmas' checked style='width:16px;height:16px;'> Turmas"
        + "</label>"
        + "<label style='display:flex;align-items:center;gap:9px;font-size:13px;cursor:pointer;'>"
        +   "<input type='checkbox' id='al-cp-professores' checked style='width:16px;height:16px;'> Professores vinculados às turmas"
        + "</label>"
        + "<label style='display:flex;align-items:center;gap:9px;font-size:13px;cursor:pointer;'>"
        +   "<input type='checkbox' id='al-cp-config' checked style='width:16px;height:16px;'> Configurações de leitura"
        + "</label>"
        + "<label style='display:flex;align-items:center;gap:9px;font-size:13px;cursor:pointer;color:#94a3b8;'>"
        +   "<input type='checkbox' id='al-cp-rotinas' disabled style='width:16px;height:16px;'> Rotinas <small>(não disponível)</small>"
        + "</label>"
        + "<label style='display:flex;align-items:center;gap:9px;font-size:13px;cursor:pointer;color:#94a3b8;'>"
        +   "<input type='checkbox' id='al-cp-lancamentos' disabled style='width:16px;height:16px;'> Lançamentos <small>(não disponível)</small>"
        + "</label>"
        + "</div>"
        + "<div style='display:flex;gap:10px;margin-top:18px;justify-content:flex-end;'>"
        + "<button class='atv-btn-secondary' onclick='_alFinalizarCriacao(_alPendingPayload, null)' style='font-size:12px;padding:7px 14px;'>Criar sem copiar</button>"
        + "<button class='atv-btn-primary'   onclick='_alConfirmarCopia()' style='font-size:12px;padding:7px 14px;'><i class=\"fas fa-copy\"></i> Copiar e criar</button>"
        + "</div>";
    mostrarModalPersonalizado("Copiar estrutura?", html);
}

async function _alConfirmarCopia() {
    fecharModalPersonalizado();
    var copiarTurmas      = document.getElementById("al-cp-turmas")      && document.getElementById("al-cp-turmas").checked;
    var copiarProfessores = document.getElementById("al-cp-professores") && document.getElementById("al-cp-professores").checked;
    await _alFinalizarCriacao(_alPendingPayload, { turmas: copiarTurmas, professores: copiarProfessores });
}

async function _alFinalizarCriacao(payload, copiar) {
    fecharModalPersonalizado();
    var criado = await sbCriarAnoLetivo(payload);
    if (!criado) { mostrarModalAviso("Erro", "Não foi possível criar o ano letivo. Verifique o Supabase."); return; }

    /* Copiar turmas e professores se solicitado */
    if (copiar && copiar.turmas && _alPendingAnoBase && window.sbClient) {
        try {
            var turmasBase = await window.sbClient.from("turmas")
                .select("*").eq("ano_letivo_id", _alPendingAnoBase.id);
            if (turmasBase.data && turmasBase.data.length > 0) {
                for (var i = 0; i < turmasBase.data.length; i++) {
                    var t = turmasBase.data[i];
                    var novaT = await window.sbClient.from("turmas")
                        .insert([{ nome: t.nome, turno: t.turno, ano_letivo_id: criado.id }])
                        .select().single();
                    /* Copiar vínculos de professor se solicitado */
                    if (copiar.professores && novaT.data && t.id) {
                        var vincs = await window.sbClient.from("professor_turmas")
                            .select("professor_id").eq("turma_id", t.id);
                        if (vincs.data && vincs.data.length > 0) {
                            var novosVincs = vincs.data.map(function(v){
                                return { professor_id: v.professor_id, turma_id: novaT.data.id };
                            });
                            await window.sbClient.from("professor_turmas").insert(novosVincs);
                        }
                    }
                }
            }
        } catch(e) { console.warn("[alCopiarEstrutura]", e.message); }
    }

    _alAnos.unshift(criado);
    window._alAnosCache = _alAnos;
    alRenderizarLista(_alAnos);

    /* Limpa form */
    document.getElementById("al-ano").value        = "";
    document.getElementById("al-descricao").value  = "";
    document.getElementById("al-data-ini").value   = "";
    document.getElementById("al-data-fim").value   = "";
    _alPendingPayload = null; _alPendingAnoBase = null;

    mostrarModalAviso("Criado!", "Ano Letivo " + payload.ano + " cadastrado. Clique no radio para ativá-lo.");
}

/* Ativar um ano */
async function alAtivarAno(id) {
    var item = _alAnos.find(function(a){ return String(a.id) === String(id); });
    if (!item) return;
    if (item.ativo) return; /* já ativo */

    mostrarModalConfirmacao(
        "Ativar Ano Letivo",
        "Ativar <strong>" + (item.descricao || "Ano Letivo " + item.ano) + "</strong> como padrão do sistema?<br><small style='color:#64748b'>Todos os usuários passarão a ver os dados deste ano.</small>",
        async function() {
            var result = await sbAtivarAnoLetivo(id);
            if (!result) { mostrarModalAviso("Erro", "Não foi possível ativar o ano letivo."); return; }
            /* Atualiza cache local */
            _alAnos.forEach(function(a){ a.ativo = String(a.id) === String(id); });
            alRenderizarLista(_alAnos);
            alAtualizarBadgeHeader();
            mostrarModalAviso("Ativado!", (item.descricao || "Ano Letivo " + item.ano) + " agora é o ano padrão do sistema.");
        }
    );
}

/* Deletar ano */
async function alDeletarAno(id, label) {
    mostrarModalConfirmacao(
        "Excluir Ano Letivo",
        "Excluir <strong>" + label + "</strong>? Os dados vinculados (rotinas, lançamentos) não serão apagados.",
        async function() {
            var ok = await sbDeletarAnoLetivo(id);
            if (!ok) { mostrarModalAviso("Erro", "Não foi possível excluir. Verifique se há dados vinculados."); return; }
            _alAnos = _alAnos.filter(function(a){ return String(a.id) !== String(id); });
            alRenderizarLista(_alAnos);
            mostrarModalAviso("Excluído", "Ano letivo removido.");
        }
    );
}

/* Badge no header mostrando o ano ativo */
function alAtualizarBadgeHeader() {
    var ativo = _alAnos.find(function(a){ return a.ativo; });
    /* Tenta também do localStorage caso a lista ainda não tenha carregado */
    if (!ativo) ativo = getAnoLetivoAtivo ? getAnoLetivoAtivo() : null;

    /* Badge do header foi removido — não fazer nada com ele */

    /* Rodapé da sidebar: exibe o ano letivo selecionado dinamicamente */
    var sel = (typeof alGetAnoSelecionado === "function") ? alGetAnoSelecionado() : null;
    var anoExibir = sel ? sel.ano : (ativo ? ativo.ano : null);
    var sfRow = document.getElementById("sf-ano-letivo-row");
    var sfTxt = document.getElementById("sf-ano-letivo-txt");
    if (sfRow && sfTxt) {
        if (anoExibir) {
            sfTxt.textContent = "Ano Letivo " + anoExibir;
            sfRow.style.display = "flex";
        } else {
            sfRow.style.display = "none";
        }
    }
}

/* Helper: formata data ISO → dd/mm/aaaa */
function _alFmtData(iso) {
    if (!iso) return "";
    var p = iso.split("-");
    return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : iso;
}

/* ════════════════════════════════════════════════════════════════
   CONFIGURAÇÕES — Aba de Mensagens de Boas-vindas
   Depende de: mensagens.js (MensagensGerenciador)
════════════════════════════════════════════════════════════════ */

var _msgGrupoAtual  = "manha";
var _msgSubabaAtual = "mensagens";

/* ── Inicialização da aba principal ── */
async function msgInicializar() {
    await msgTrocarSubaba("mensagens", document.getElementById("msg-tab-mensagens"));
}

/* ── Troca de sub-aba (Mensagens / Aviso / Ranking / Histórico) ── */
async function msgTrocarSubaba(nome, btn) {
    _msgSubabaAtual = nome;
    ["mensagens","padrao","ranking","historico"].forEach(function(n) {
        var el = document.getElementById("msg-subaba-" + n);
        if (el) el.style.display = (n === nome) ? "" : "none";
    });
    /* Atualiza destaque apenas nos botões da navegação principal da sub-aba */
    document.querySelectorAll("#cfg-sec-mensagens > .msg-group-tabs > .msg-group-tab").forEach(function(b) {
        b.classList.remove("active");
    });
    if (btn) btn.classList.add("active");

    if (nome === "mensagens") { await msgAtualizarStats(); await msgRenderizarLista(); }
    if (nome === "padrao")    { await msgCarregarPadrao(); }
    if (nome === "ranking")   { await msgRenderizarRankingUso(); }
}

/* ── Troca de grupo (aba interna da sub-aba mensagens) ── */
function msgTrocarGrupo(grupo, btn) {
    _msgGrupoAtual = grupo;
    /* Atualiza apenas os botões dentro de #msg-subaba-mensagens */
    var subaba = document.getElementById("msg-subaba-mensagens");
    if (subaba) subaba.querySelectorAll(".msg-group-tab").forEach(function(b) { b.classList.remove("active"); });
    if (btn) btn.classList.add("active");
    msgRenderizarLista();
}

/* ── Estatísticas simplificadas — lê do Supabase ── */
async function msgAtualizarStats() {
    if (typeof MensagensGerenciador === "undefined") return;
    var set = function(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; };
    set("msg-stat-total", "…"); set("msg-stat-ativas", "…"); set("msg-stat-exib", "…");
    var s = await MensagensGerenciador.obterEstatisticas();
    if (!s) return;
    set("msg-stat-total",  s.total);
    set("msg-stat-ativas", s.ativas);
    set("msg-stat-exib",   s.totalViz);
}

/* ── Renderiza lista de mensagens do grupo atual ── */
async function msgRenderizarLista() {
    var lista = document.getElementById("msg-lista");
    if (!lista || typeof MensagensGerenciador === "undefined") return;
    lista.innerHTML = "<p style='color:#94a3b8;font-size:13px;padding:8px 0;'>Carregando…</p>";
    var data  = await MensagensGerenciador.getData();
    var grupo = data.mensagens[_msgGrupoAtual] || [];
    /* Busca contagens reais do banco para exibir no contador */
    var _contagemViz = {};
    if (typeof sbMsgContarVisualizacoes === "function" && grupo.length) {
        try {
            var ids = grupo.map(function(m) { return m.id; });
            _contagemViz = await sbMsgContarVisualizacoes(ids) || {};
        } catch(e) {}
    }

    if (!grupo.length) {
        lista.innerHTML = "<p style='color:#94a3b8;font-size:13px;padding:12px 0;'>Nenhuma mensagem neste grupo.</p>";
        return;
    }
    lista.innerHTML = grupo.map(function(m) {
        var inativa    = m.ativo === false ? " inativa" : "";
        var iconeAtivo = m.ativo === false ? "<i class='fas fa-eye-slash'></i>" : "<i class='fas fa-eye'></i>";
        var titleAtivo = m.ativo === false ? "Ativar" : "Desativar";
        var classeAtivo = m.ativo === false ? "ativar" : "desativar";
        return "<div class='msg-item" + inativa + "' id='msgitem_" + m.id + "'>"
            + "<div style='flex:1;'>"
            + "<div class='msg-item-texto'>" + _msgEscaparHtml(m.texto) + "</div>"
            + "<div class='msg-item-meta'>" + (_contagemViz[m.id] || 0) + " exibição(ões)</div>"
            + "<div class='msg-edit-inline' id='msgedit_" + m.id + "'>"
            + "<input class='msg-edit-input' id='msgeditinput_" + m.id + "' value='" + _msgEscaparAttr(m.texto) + "'>"
            + "<button class='msg-edit-save' onclick='msgSalvarEdicao(\"" + m.id + "\")'><i class='fas fa-check'></i></button>"
            + "<button class='msg-edit-save' style='background:#64748b;' onclick='msgCancelarEdicao(\"" + m.id + "\")'><i class='fas fa-times'></i></button>"
            + "</div></div>"
            + "<div class='msg-item-acoes'>"
            + "<button class='msg-btn-icon " + classeAtivo + "' title='" + titleAtivo + "' onclick='msgToggle(\"" + m.id + "\")'>" + iconeAtivo + "</button>"
            + "<button class='msg-btn-icon editar' title='Editar' onclick='msgAbrirEdicao(\"" + m.id + "\")'><i class='fas fa-pencil-alt'></i></button>"
            + "<button class='msg-btn-icon excluir' title='Excluir' onclick='msgExcluir(\"" + m.id + "\")'><i class='fas fa-trash'></i></button>"
            + "</div></div>";
    }).join("");
}

/* ── Adicionar nova mensagem ── */
async function msgAdicionar() {
    var input = document.getElementById("msg-nova-txt");
    if (!input || !input.value.trim()) return;
    if (typeof MensagensGerenciador === "undefined") return;
    var ok = await MensagensGerenciador.adicionarMensagem(_msgGrupoAtual, input.value.trim());
    if (ok) { input.value = ""; await msgRenderizarLista(); await msgAtualizarStats(); }
}

/* ── Toggle ativo/inativo ── */
async function msgToggle(id) {
    if (typeof MensagensGerenciador === "undefined") return;
    await MensagensGerenciador.toggleAtivo(id);
    await msgRenderizarLista(); await msgAtualizarStats();
}

/* ── Excluir mensagem ── */
async function msgExcluir(id) {
    if (!confirm("Excluir esta mensagem?")) return;
    if (typeof MensagensGerenciador === "undefined") return;
    await MensagensGerenciador.removerMensagem(id);
    await msgRenderizarLista(); await msgAtualizarStats();
}

/* ── Edição inline ── */
function msgAbrirEdicao(id) {
    document.querySelectorAll(".msg-edit-inline.open").forEach(function(el) { el.classList.remove("open"); });
    var edit = document.getElementById("msgedit_" + id);
    if (edit) edit.classList.add("open");
    var input = document.getElementById("msgeditinput_" + id);
    if (input) { input.focus(); input.select(); }
}
function msgCancelarEdicao(id) {
    var edit = document.getElementById("msgedit_" + id);
    if (edit) edit.classList.remove("open");
}
async function msgSalvarEdicao(id) {
    var input = document.getElementById("msgeditinput_" + id);
    if (!input || !input.value.trim()) return;
    if (typeof MensagensGerenciador === "undefined") return;
    await MensagensGerenciador.editarMensagem(id, input.value.trim());
    await msgRenderizarLista(); await msgAtualizarStats();
}

/* ── Restaurar / Zerar ── */
async function msgRestaurarPadrao() {
    if (!confirm("Restaurar padrão do grupo \"" + _msgGrupoAtual + "\"?")) return;
    if (typeof MensagensGerenciador === "undefined") return;
    await MensagensGerenciador.restaurarPadrao(_msgGrupoAtual);
    await msgRenderizarLista(); await msgAtualizarStats();
}
async function msgZerarContadores() {
    if (!confirm("Zerar os contadores do grupo \"" + _msgGrupoAtual + "\"?")) return;
    if (typeof MensagensGerenciador === "undefined") return;
    await MensagensGerenciador.resetarCiclo(_msgGrupoAtual);
    await msgRenderizarLista(); await msgAtualizarStats();
}

/* ════════════════════════════════════════════════════════
   SUB-ABA: AVISO / EVENTO (mensagem padrão)
════════════════════════════════════════════════════════ */

async function msgCarregarPadrao() {
    if (typeof MensagensGerenciador === "undefined") return;
    var mp = await MensagensGerenciador.obterMensagemPadrao();
    /* CORREÇÃO: mp pode ser null quando não há nenhum aviso salvo */
    mp = mp || { texto: "", ativo: false, uma_vez: true, inicio: "", fim: "" };
    var txt    = document.getElementById("msg-padrao-txt");
    var ini    = document.getElementById("msg-padrao-inicio");
    var fim    = document.getElementById("msg-padrao-fim");
    var umavez = document.getElementById("msg-padrao-umavez");
    var ativo  = document.getElementById("msg-padrao-ativo");
    if (txt)    txt.value      = mp.texto   || "";
    if (ini)    ini.value      = mp.inicio  || "";
    if (fim)    fim.value      = mp.fim     || "";
    if (umavez) umavez.checked = mp.uma_vez !== false;
    if (ativo)  ativo.checked  = !!mp.ativo;
    msgAtualizarStatusPadrao(mp);
}

async function msgSalvarPadrao() {
    if (typeof MensagensGerenciador === "undefined") return;
    var cfg = {
        texto:   (document.getElementById("msg-padrao-txt")    || {}).value || "",
        inicio:  (document.getElementById("msg-padrao-inicio") || {}).value || "",
        fim:     (document.getElementById("msg-padrao-fim")    || {}).value || "",
        uma_vez: (document.getElementById("msg-padrao-umavez") || {}).checked !== false,
        ativo:   !!(document.getElementById("msg-padrao-ativo") || {}).checked
    };
    if (!cfg.texto.trim()) { alert("Digite o texto do aviso antes de salvar."); return; }
    MensagensGerenciador.salvarMensagemPadrao(cfg);
    msgAtualizarStatusPadrao(cfg);
    /* Feedback visual */
    var btn = event && event.target;
    if (btn) {
        var orig = btn.innerHTML;
        btn.innerHTML = "<i class='fas fa-check'></i> Salvo!";
        btn.style.background = "#16a34a";
        setTimeout(function() { btn.innerHTML = orig; btn.style.background = ""; }, 2000);
    }
}

async function msgDescartarPadrao() {
    if (!confirm("Descartar o aviso ativo? Isso irá remover a mensagem do Supabase e desativar o aviso para todos os usuários.")) return;
    if (typeof MensagensGerenciador === "undefined") return;
    mostrarLoadingSimples("Descartando aviso...");
    try {
        await MensagensGerenciador.descartarMensagemPadrao();
    } finally {
        ocultarLoadingSimples();
    }
    /* Limpa o formulário */
    var txt    = document.getElementById("msg-padrao-txt");
    var ini    = document.getElementById("msg-padrao-inicio");
    var fim    = document.getElementById("msg-padrao-fim");
    var umavez = document.getElementById("msg-padrao-umavez");
    var ativo  = document.getElementById("msg-padrao-ativo");
    if (txt)    txt.value      = "";
    if (ini)    ini.value      = "";
    if (fim)    fim.value      = "";
    if (umavez) umavez.checked = true;
    if (ativo)  ativo.checked  = false;
    /* Atualiza o status */
    msgAtualizarStatusPadrao(null);
}

function msgAtualizarStatusPadrao(mp) {
    var el = document.getElementById("msg-padrao-status");
    if (!el) return;
    if (!mp || !mp.texto) { el.style.display = "none"; return; }
    el.style.display = "";
    var ativo = !!mp.ativo;
    var hoje  = new Date();
    var dentroDoperiodo = true;
    if (mp.inicio) { var ini = new Date(mp.inicio + "T00:00:00"); if (hoje < ini) dentroDoperiodo = false; }
    if (mp.fim)    { var fim = new Date(mp.fim    + "T23:59:59"); if (hoje > fim) dentroDoperiodo = false; }

    if (ativo && dentroDoperiodo) {
        el.style.background = "#dcfce7"; el.style.color = "#166534"; el.style.border = "1px solid #86efac";
        var lidas = (mp.lidas || []).length;
        el.innerHTML = "<i class='fas fa-check-circle'></i> <strong>Aviso ativo</strong> — " + lidas + " usuário(s) já viram esta mensagem.";
    } else if (ativo && !dentroDoperiodo) {
        el.style.background = "#fef9c3"; el.style.color = "#854d0e"; el.style.border = "1px solid #fde047";
        el.innerHTML = "<i class='fas fa-clock'></i> Aviso ativo mas <strong>fora do período</strong> configurado.";
    } else {
        el.style.background = "#f1f5f9"; el.style.color = "#64748b"; el.style.border = "1px solid #e2e8f0";
        el.innerHTML = "<i class='fas fa-minus-circle'></i> Aviso <strong>desativado</strong>.";
    }
}

/* ════════════════════════════════════════════════════════
   SUB-ABAS: RANKING DE USO (acessos + tempo) — Supabase
   Ambas as sub-abas "ranking" e "histórico" exibem o mesmo
   painel de estatísticas de uso, vindo de acessos_sistema.
════════════════════════════════════════════════════════ */

async function msgRenderizarRankingUso() {
    var elRanking   = document.getElementById("msg-ranking-lista");
    var loading = "<p style='color:#94a3b8;font-size:13px;'>Carregando…</p>";
    if (elRanking)   elRanking.innerHTML   = loading;

    if (typeof sbTelObterEstatisticas !== "function") {
        if (elRanking) elRanking.innerHTML = "<p style='color:#94a3b8;font-size:13px;'>Supabase indisponível.</p>";
        return;
    }
    var stats = await sbTelObterEstatisticas();
    if (!stats) {
        if (elRanking) elRanking.innerHTML = "<p style='color:#94a3b8;font-size:13px;'>Não foi possível carregar os dados.</p>";
        return;
    }
    var html = _msgMontarRankingUso(stats);
    /* Botão limpar ranking */
    html += "<div style='margin-top:20px;padding-top:16px;border-top:1px solid #f1f5f9;'>"
        + "<button onclick='msgLimparRanking()' style='padding:8px 16px;background:white;border:1.5px solid #fca5a5;border-radius:8px;font-size:12px;color:#dc2626;cursor:pointer;'>"
        + "<i class=\"fas fa-trash\"></i> Limpar todo o ranking</button></div>";
    if (elRanking) elRanking.innerHTML = html;
}

/* FIX 6: Limpar ranking */
async function msgLimparRanking() {
    if (!confirm("Deseja realmente limpar o ranking e zerar todas as estatísticas de acesso?\n\nEsta ação não pode ser desfeita.")) return;
    if (typeof sbTelLimparRanking !== "function") return;
    var ok = await sbTelLimparRanking();
    if (ok) {
        await msgRenderizarRankingUso();
    } else {
        alert("Não foi possível limpar o ranking. Verifique a conexão.");
    }
}

function _msgMontarRankingUso(stats) {
    var medalhas  = ["🥇","🥈","🥉"];
    var coresMed  = ["#f59e0b","#94a3b8","#cd7c3b"];

    function _fmtTempo(seg) {
        if (!seg || seg <= 0) return "—";
        var h = Math.floor(seg / 3600);
        var m = Math.floor((seg % 3600) / 60);
        if (h > 0) return h + "h " + String(m).padStart(2,"0") + "min";
        return m + "min";
    }
    function _fmtData(iso) {
        if (!iso) return "—";
        var d = new Date(iso);
        return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" });
    }
    function _linha(u, i, valorPrincipal, labelPrincipal, valorSec, labelSec) {
        var borda  = i < 3 ? "border-left:3px solid " + coresMed[i] + ";" : "";
        var medalha = medalhas[i]
            ? "<span style=\"font-size:22px;line-height:1;flex-shrink:0;\">" + medalhas[i] + "</span>"
            : "<span style=\"font-size:13px;font-weight:700;color:#94a3b8;min-width:22px;text-align:center;\">" + (i+1) + "º</span>";
        return "<div class=\"msg-item\" style=\"" + borda + "align-items:center;gap:14px;padding:12px 16px;\">"
            + medalha
            + "<div style=\"flex:1;\">"
            + "<div style=\"font-size:14px;font-weight:700;color:#1e293b;\">" + _msgEscaparHtml(u.nome) + "</div>"
            + "<div style=\"font-size:11px;color:#94a3b8;margin-top:2px;\">"
            +   "<span style=\"color:#475569;\">" + labelSec + ":</span> " + valorSec
            + "</div></div>"
            + "<div style=\"text-align:right;\">"
            + "<div style=\"font-size:20px;font-weight:900;color:#1d4ed8;\">" + valorPrincipal + "</div>"
            + "<div style=\"font-size:11px;color:#64748b;\">" + labelPrincipal + "</div>"
            + "</div></div>";
    }

    var html = "";

    /* ── Ranking por acessos ── */
    html += "<h4 style=\"margin:0 0 12px;font-size:14px;color:#1e293b;\">"
        + "<i class=\"fas fa-trophy\" style=\"color:#d97706;margin-right:6px;\"></i>Mais acessos</h4>";

    if (!stats.rankAcessos || !stats.rankAcessos.length) {
        html += "<p style=\"color:#94a3b8;font-size:13px;margin-bottom:20px;\">Nenhum dado ainda.</p>";
    } else {
        html += "<div style=\"display:flex;flex-direction:column;gap:6px;margin-bottom:24px;\">";
        stats.rankAcessos.forEach(function(u, i) {
            html += _linha(u, i,
                u.acessos, "acessos",
                _fmtTempo(u.segundos), "tempo total"
            );
        });
        html += "</div>";
    }

    /* ── Ranking por tempo ── */
    html += "<h4 style=\"margin:0 0 12px;font-size:14px;color:#1e293b;\">"
        + "<i class=\"fas fa-clock\" style=\"color:#2563eb;margin-right:6px;\"></i>Maior tempo de uso</h4>";

    if (!stats.rankTempo || !stats.rankTempo.length) {
        html += "<p style=\"color:#94a3b8;font-size:13px;\">Nenhum dado ainda.</p>";
    } else {
        html += "<div style=\"display:flex;flex-direction:column;gap:6px;\">";
        stats.rankTempo.forEach(function(u, i) {
            html += _linha(u, i,
                _fmtTempo(u.segundos), "tempo total",
                u.acessos + " acesso(s)", "acessos"
            );
        });
        html += "</div>";
    }

    return html;
}


function _msgEscaparHtml(str) {
    return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function _msgEscaparAttr(str) {
    return String(str).replace(/'/g,"&#39;").replace(/"/g,"&quot;");
}