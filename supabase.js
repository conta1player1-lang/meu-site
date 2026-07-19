/* ════════════════════════════════════════════════════════════════
   supabase.js v3.0 -- SEM SUPABASE AUTH
   Autenticacao propria: telefone + senha via tabela app_users
   Roles: admin | professor | supervisora
   Cache em memoria para turmas e alunos
   A.V. Leitura+
════════════════════════════════════════════════════════════════ */
 
var SUPABASE_URL = "https://aprthgkkzojwklxnoeij.supabase.co";
var SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwcnRoZ2trem9qd2tseG5vZWlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NTIxNDEsImV4cCI6MjA5MzIyODE0MX0.HCKdokza0ECTcevzjyZUHBNslrPiLG9ug_1Y4ZoEAi0";
 
window.sbClient  = null;
window.sbOnline  = false;
 
/* Cache em memoria */
var _cacheTurmas = {};  /* { nome: { id, nome, ... } } */
var _cacheAlunos = {};  /* { "turmaId|nomeAluno": { id, nome, turma_id } } */
 
function _invalidarCache() { _cacheTurmas = {}; _cacheAlunos = {}; }
 
/* ════════════════════════════════════════════════════════════════
   INICIALIZACAO -- sem auth, sem onAuthStateChange
════════════════════════════════════════════════════════════════ */
function inicializarSupabase() {
    try {
        if (!window.supabase || !window.supabase.createClient) {
            console.warn("[SB] CDN ausente -- modo offline.");
            return;
        }
        /* Sem opcoes de auth -- nao usamos Supabase Auth */
        window.sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false }
        });
        console.log("[SB] v3.0 inicializado (sem Auth).");
    } catch(e) { console.error("[SB] Erro ao inicializar:", e); }
}
 
async function testarConexaoSupabase() {
    if (!window.sbClient) return false;
    try {
        var r = await window.sbClient.from("sys_config").select("id").limit(1);
        if (r.error) throw r.error;
        window.sbOnline = true;
        console.log("[SB] Online v");
        return true;
    } catch(e) {
        window.sbOnline = false;
        console.warn("[SB] Offline:", e.message);
        return false;
    }
}
 
function isUUID(id) {
    return typeof id === "string" && /^[0-9a-f-]{36}$/.test(id);
}
 
/* ════════════════════════════════════════════════════════════════
   AUTENTICACAO PROPRIA -- select por telefone + senha
   Sem JWT, sem email, sem confirmacao, sem refresh token
════════════════════════════════════════════════════════════════ */
async function sbLogin(telefone, senha) {
    if (!window.sbClient) return null;
    try {
        var tel = telefone.toString().trim().replace(/\D/g, ""); /* so numeros */
        var r = await window.sbClient
            .from("app_users")
            .select("id,nome,telefone,role,tema,foto_url,ultimo_acesso")
            .eq("telefone", tel)
            .eq("senha", senha)
            .maybeSingle();
 
        if (r.error) throw r.error;
        if (!r.data)  return null; /* credenciais invalidas */
 
        /* Registrar ultimo acesso em background */
        window.sbClient.from("app_users")
            .update({ ultimo_acesso: new Date().toISOString() })
            .eq("id", r.data.id)
            .then(function(){}).catch(function(){});
 
        _invalidarCache();
        console.log("[sbLogin] OK:", r.data.nome, "(", r.data.role, ")");
        return r.data;
    } catch(e) {
        console.error("[sbLogin]", e.message);
        return null;
    }
}
 
/* ════════════════════════════════════════════════════════════════
   USUARIOS (app_users)
════════════════════════════════════════════════════════════════ */
async function sbBuscarUsuarios() {
    if (!window.sbClient) return null;
    try {
        var r = await window.sbClient
            .from("app_users")
            .select("id,nome,telefone,role,foto_url,ultimo_acesso,criado_em")
            .order("nome");
        if (r.error) throw r.error;
        return r.data;
    } catch(e) { console.error("[sbBuscarUsuarios]", e.message); return null; }
}
 
async function sbCriarUsuario(dados) {
    if (!window.sbClient) return null;
    try {
        var payload = {
            nome:     dados.nome,
            telefone: dados.telefone.toString().replace(/\D/g, ""),
            senha:    dados.senha,
            role:     dados.role || "professor",
            foto_url: dados.foto_url || null
        };
        var r = await window.sbClient
            .from("app_users").insert([payload]).select().single();
        if (r.error) throw r.error;
 
        /* Vincular turmas se informadas */
        if (dados.turmas && dados.turmas.length > 0) {
            await sbVincularTurmasProfessor(r.data.id, dados.turmas);
        }
        return r.data;
    } catch(e) {
        console.error("[sbCriarUsuario]", e.message);
        if (e.message && e.message.indexOf("duplicate key") !== -1) {
            if (typeof mostrarModalAviso === "function")
                mostrarModalAviso("Telefone ja cadastrado",
                    "O telefone " + dados.telefone + " ja esta em uso.");
        }
        return null;
    }
}
 
async function sbAtualizarUsuario(id, dados) {
    if (!window.sbClient || !isUUID(id)) return null;
    try {
        var upd = { nome: dados.nome, role: dados.role };
        if (dados.foto_url)          upd.foto_url = dados.foto_url;
        if (dados.senha)             upd.senha    = dados.senha;
        if (dados.telefone)          upd.telefone = dados.telefone.toString().replace(/\D/g, "");
        var r = await window.sbClient
            .from("app_users").update(upd).eq("id", id).select().single();
        if (r.error) throw r.error;
 
        /* Atualizar vinculos de turmas */
        if (dados.turmas !== undefined) {
            await sbVincularTurmasProfessor(id, dados.turmas);
        }
        return r.data;
    } catch(e) { console.error("[sbAtualizarUsuario]", e.message); return null; }
}
 
async function sbDeletarUsuario(id) {
    if (!window.sbClient || !isUUID(id)) return false;
    try {
        var r = await window.sbClient.from("app_users").delete().eq("id", id);
        if (r.error) throw r.error;
        return true;
    } catch(e) { console.error("[sbDeletarUsuario]", e.message); return false; }
}
 
async function sbTelefoneExiste(telefone) {
    if (!window.sbClient) return false;
    try {
        var tel = telefone.toString().replace(/\D/g, "");
        var r = await window.sbClient
            .from("app_users").select("id").eq("telefone", tel).maybeSingle();
        return !!(r.data);
    } catch(e) { return false; }
}
 
/* ════════════════════════════════════════════════════════════════
   VINCULO PROFESSOR <-> TURMAS
════════════════════════════════════════════════════════════════ */
async function sbBuscarTurmasDoProfessor(professorId) {
    if (!window.sbClient) return [];
    try {
        var anoId = alGetAnoSelecionadoId();

        /* Tenta primeiro com tipo_vinculo (após migration) */
        var q = window.sbClient
            .from("professor_turmas")
            .select("turma_id, ano_letivo_id, ativo, tipo_vinculo, turmas(id, nome, turno, ano_letivo_id)")
            .eq("professor_id", professorId)
            .eq("ativo", true);
        if (anoId) q = q.eq("ano_letivo_id", anoId);
        var r = await q;

        /* Se a coluna ainda não existe no banco, faz fallback sem ela */
        if (r.error) {
            if (r.error.message && r.error.message.includes("tipo_vinculo")) {
                console.warn("[sbBuscarTurmasDoProfessor] Coluna tipo_vinculo ausente — usando fallback. Execute a migration no Supabase.");
                var q2 = window.sbClient
                    .from("professor_turmas")
                    .select("turma_id, ano_letivo_id, ativo, turmas(id, nome, turno, ano_letivo_id)")
                    .eq("professor_id", professorId)
                    .eq("ativo", true);
                if (anoId) q2 = q2.eq("ano_letivo_id", anoId);
                var r2 = await q2;
                if (r2.error) throw r2.error;
                return (r2.data || []).map(function(pt) {
                    if (!pt.turmas) return null;
                    return Object.assign({}, pt.turmas, { tipo_vinculo: "titular" });
                }).filter(Boolean);
            }
            throw r.error;
        }

        return (r.data || []).map(function(pt) {
            if (!pt.turmas) return null;
            return Object.assign({}, pt.turmas, {
                tipo_vinculo: pt.tipo_vinculo || "titular"
            });
        }).filter(Boolean);

    } catch(e) { console.error("[sbBuscarTurmasDoProfessor]", e.message); return []; }
}
 
async function sbVincularTurmasProfessor(professorId, turmasComTipo) {
    if (!window.sbClient) return;
    var anoId = alGetAnoSelecionadoId();
    try {
        /* Remover vínculos APENAS do ano selecionado — preserva histórico de outros anos */
        var delQ = window.sbClient
            .from("professor_turmas")
            .delete()
            .eq("professor_id", professorId);
        if (anoId) delQ = delQ.eq("ano_letivo_id", anoId);
        await delQ;

        if (!turmasComTipo || turmasComTipo.length === 0) return;

        /* turmasComTipo pode ser:
           - array de strings/UUIDs (legado — todos viram titular)
           - array de {id, tipo_vinculo} (novo formato) */
        var vinculos = [];
        for (var i = 0; i < turmasComTipo.length; i++) {
            var item = turmasComTipo[i];
            var turmaId, tipoVinculo;
            if (typeof item === "object" && item !== null) {
                turmaId     = isUUID(item.id) ? item.id : await sbBuscarIdTurma(item.id || item.nome);
                tipoVinculo = item.tipo_vinculo || "titular";
            } else {
                turmaId     = isUUID(item) ? item : await sbBuscarIdTurma(item);
                tipoVinculo = "titular"; /* legado: assume titular */
            }
            if (turmaId) {
                vinculos.push({
                    professor_id:  professorId,
                    turma_id:      turmaId,
                    ano_letivo_id: anoId || null,
                    ativo:         true,
                    tipo_vinculo:  tipoVinculo
                });
            }
        }
        if (vinculos.length > 0) {
            /* Tenta upsert com tipo_vinculo; se a coluna não existir, faz sem ela */
            var up = await window.sbClient.from("professor_turmas")
                .upsert(vinculos, { onConflict: "professor_id,turma_id,ano_letivo_id" });
            if (up.error && up.error.message && up.error.message.includes("tipo_vinculo")) {
                console.warn("[sbVincularTurmasProfessor] Coluna tipo_vinculo ausente — salvando sem ela. Execute a migration.");
                var vinculosSemTipo = vinculos.map(function(v) {
                    return { professor_id: v.professor_id, turma_id: v.turma_id,
                             ano_letivo_id: v.ano_letivo_id, ativo: v.ativo };
                });
                await window.sbClient.from("professor_turmas")
                    .upsert(vinculosSemTipo, { onConflict: "professor_id,turma_id,ano_letivo_id" });
            }
        }
    } catch(e) { console.error("[sbVincularTurmasProfessor]", e.message); }
}

/**
 * sbBuscarIdTurma — resolve nome → UUID sem criar turma nova.
 * Filtra pelo ano letivo selecionado para evitar retornar
 * turmas homônimas de outros anos.
 */
async function sbBuscarIdTurma(nomeTurma) {
    if (!nomeTurma) return null;
    var anoId = alGetAnoSelecionadoId();
    var chave = (anoId || "sem-ano") + "|" + nomeTurma;
    if (_cacheTurmas[chave]) return _cacheTurmas[chave].id;
    try {
        var q = window.sbClient.from("turmas")
            .select("id,nome,ano_letivo_id").eq("nome", nomeTurma);
        if (anoId) q = q.eq("ano_letivo_id", anoId);
        var r = await q.maybeSingle();
        if (r.data) { _cacheTurmas[chave] = r.data; return r.data.id; }
        console.warn("[sbBuscarIdTurma] Turma não encontrada no ano", anoId, ":", nomeTurma);
        return null;
    } catch(e) { console.error("[sbBuscarIdTurma]", e.message); return null; }
}
 
/* ════════════════════════════════════════════════════════════════
   RESOLUCAO DE IDs (cache em memoria)
════════════════════════════════════════════════════════════════ */
async function sbResolverTurmaId(nomeTurma) {
    /* Busca turma no cache, filtrando pelo ano selecionado */
    var anoId = alGetAnoSelecionadoId();
    var chave = (anoId || "sem-ano") + "|" + nomeTurma;
    if (_cacheTurmas[chave]) return _cacheTurmas[chave].id;
    /* Fallback legado */
    if (_cacheTurmas[nomeTurma] && (!anoId || String(_cacheTurmas[nomeTurma].ano_letivo_id) === String(anoId))) {
        return _cacheTurmas[nomeTurma].id;
    }
    try {
        var q = window.sbClient.from("turmas")
            .select("id,nome,ano_letivo_id").eq("nome", nomeTurma);
        if (anoId) q = q.eq("ano_letivo_id", anoId);
        var r = await q.maybeSingle();
        if (r.data) {
            _cacheTurmas[chave] = r.data;
            _cacheTurmas[nomeTurma] = r.data;
            return r.data.id;
        }
        /* Turma não existe neste ano — NÃO criar automaticamente */
        console.warn("[sbResolverTurmaId] Turma não encontrada no ano", anoId, ":", nomeTurma);
        return null;
    } catch(e) { console.error("[sbResolverTurmaId]", e.message); return null; }
}

async function sbCriarTurmaSeNaoExistir(nomeTurma) {
    /* Mantido por compatibilidade, mas agora inclui ano_letivo_id */
    var anoId = alGetAnoSelecionadoId();
    try {
        var payload = { nome: nomeTurma, ano_letivo_id: anoId || null };
        var r = await window.sbClient.from("turmas")
            .insert([payload]).select().single();
        if (r.error) {
            if (r.error.code === "23505") {
                var q2 = window.sbClient.from("turmas")
                    .select("id,nome,ano_letivo_id").eq("nome", nomeTurma);
                if (anoId) q2 = q2.eq("ano_letivo_id", anoId);
                var r2 = await q2.single();
                if (r2.data) { _cacheTurmas[nomeTurma] = r2.data; return r2.data.id; }
            }
            throw r.error;
        }
        _cacheTurmas[nomeTurma] = r.data;
        return r.data.id;
    } catch(e) { console.error("[sbCriarTurmaSeNaoExistir]", e.message); return null; }
}
 
/* Resolve aluno_id + matricula_id para uma turma+ano */
async function sbResolverAlunoId(nomeAluno, turmaId) {
    var chave = turmaId + "|" + nomeAluno;
    if (_cacheAlunos[chave]) return _cacheAlunos[chave].id;
    try {
        var r = await window.sbClient.from("alunos")
            .select("id,nome").eq("nome", nomeAluno).maybeSingle();
        if (r.data) { _cacheAlunos[chave] = r.data; return r.data.id; }
        return null;
    } catch(e) { return null; }
}

/* Resolve matricula_id para um aluno numa turma+ano específicos */
async function sbResolverMatriculaId(nomeAluno, turmaId) {
    var anoId = alGetAnoSelecionadoId();
    var chave = "mat|" + turmaId + "|" + (anoId||"") + "|" + nomeAluno;
    /* Verifica cache com chave específica */
    if (_cacheAlunos[chave]) return _cacheAlunos[chave];
    /* Verifica também cache do sbAdicionarAluno (chave turmaId|nome) */
    var chaveSimples = turmaId + "|" + nomeAluno;
    if (_cacheAlunos[chaveSimples] && _cacheAlunos[chaveSimples].matricula_id) {
        var mid = _cacheAlunos[chaveSimples].matricula_id;
        _cacheAlunos[chave] = mid; /* sincroniza */
        return mid;
    }
    try {
        /* Busca aluno por nome */
        var ra = await window.sbClient.from("alunos")
            .select("id").eq("nome", nomeAluno).maybeSingle();
        if (!ra.data) {
            console.warn("[sbResolverMatriculaId] Aluno não encontrado:", nomeAluno);
            return null;
        }
        var alunoId = ra.data.id;
        /* Busca matrícula deste aluno nesta turma+ano */
        var qm = window.sbClient.from("matriculas")
            .select("id").eq("aluno_id", alunoId).eq("turma_id", turmaId);
        if (anoId) qm = qm.eq("ano_letivo_id", anoId);
        var rm = await qm.maybeSingle();
        if (rm.data) {
            _cacheAlunos[chave] = rm.data.id;
            /* Sincroniza cache simples também */
            if (!_cacheAlunos[chaveSimples]) _cacheAlunos[chaveSimples] = {};
            if (typeof _cacheAlunos[chaveSimples] === "object") {
                _cacheAlunos[chaveSimples].matricula_id = rm.data.id;
            }
            return rm.data.id;
        }
        console.warn("[sbResolverMatriculaId] Matrícula não encontrada — aluno:", nomeAluno, "turma:", turmaId, "ano:", anoId);
        return null;
    } catch(e) { console.error("[sbResolverMatriculaId]", e.message); return null; }
}
 
/* ════════════════════════════════════════════════════════════════
   TURMAS
════════════════════════════════════════════════════════════════ */
async function sbBuscarTurmas() {
    if (!window.sbClient) return null;
    try {
        var anoId = alGetAnoSelecionadoId();
        var q = window.sbClient.from("turmas").select("*").order("nome");
        if (anoId) q = q.eq("ano_letivo_id", anoId);
        var r = await q;
        if (r.error) throw r.error;
        (r.data || []).forEach(function(t) { _cacheTurmas[t.nome] = t; });
        return r.data;
    } catch(e) { console.error("[sbBuscarTurmas]", e.message); return null; }
}
 
async function sbAdicionarTurma(nome, turno, oculta) {
    if (!window.sbClient) return null;
    try {
        var anoId = alGetAnoSelecionadoId();
        var payload = {
            nome:          nome,
            turno:         turno || "Matutino",
            ano_letivo_id: anoId || null,
            oculta:        oculta === true
        };
        var r = await window.sbClient
            .from("turmas").insert([payload]).select().single();
        if (r.error) throw r.error;
        _cacheTurmas[nome] = r.data;
        return r.data;
    } catch(e) { console.error("[sbAdicionarTurma]", e.message); return null; }
}

async function sbToggleOcultarTurma(nome, oculta) {
    if (!window.sbClient) return false;
    try {
        var r = await window.sbClient
            .from("turmas").update({ oculta: !!oculta }).eq("nome", nome);
        if (r.error) throw r.error;
        if (_cacheTurmas[nome]) _cacheTurmas[nome].oculta = !!oculta;
        return true;
    } catch(e) { console.error("[sbToggleOcultarTurma]", e.message); return false; }
}
 
async function sbDeletarTurma(nome) {
    if (!window.sbClient || !nome) return false;
    try {
        /* 1. Resolver turmaId */
        var turmaId = _cacheTurmas[nome] ? _cacheTurmas[nome].id : null;
        if (!turmaId) {
            var rt = await window.sbClient.from("turmas")
                .select("id").eq("nome", nome).maybeSingle();
            if (rt.data) turmaId = rt.data.id;
        }
        if (turmaId) {
            /* 2. Coletar aluno_ids das matrículas desta turma ANTES de apagá-las */
            var rmAt = await window.sbClient.from("matriculas")
                .select("aluno_id").eq("turma_id", turmaId);
            var alunoIds = (rmAt.data || []).map(function(m) { return m.aluno_id; }).filter(Boolean);

            /* 3. Apagar rotinas e vínculos de professor (sem CASCADE no banco ainda) */
            await window.sbClient.from("rotinas").delete().eq("turma_id", turmaId);
            await window.sbClient.from("professor_turmas").delete().eq("turma_id", turmaId);

            /* 4. Apagar matrículas — CASCADE apaga lancamentos automaticamente */
            await window.sbClient.from("matriculas").delete().eq("turma_id", turmaId);

            /* 5. Apagar alunos que não têm matrícula em nenhuma outra turma */
            for (var i = 0; i < alunoIds.length; i++) {
                var aid = alunoIds[i];
                var outras = await window.sbClient.from("matriculas")
                    .select("id").eq("aluno_id", aid);
                if (!outras.data || outras.data.length === 0) {
                    await window.sbClient.from("alunos").delete().eq("id", aid);
                }
            }
        }

        /* 6. Apagar a turma */
        var r = await window.sbClient.from("turmas").delete().eq("nome", nome);
        if (r.error) throw r.error;
        delete _cacheTurmas[nome];
        return true;
    } catch(e) { console.error("[sbDeletarTurma]", e.message); return false; }
}
 
/* ════════════════════════════════════════════════════════════════
   ALUNOS
════════════════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════════════════
   ALUNOS — via matriculas
════════════════════════════════════════════════════════════════ */
async function sbBuscarAlunos(nomeTurma) {
    if (!window.sbClient) return null;
    try {
        var turmaId = await sbResolverTurmaId(nomeTurma);
        if (!turmaId) return [];
        var anoId = alGetAnoSelecionadoId();
        /* Busca via matriculas → alunos */
        var q = window.sbClient.from("matriculas")
            .select("id, aluno_id, principal, alunos(id, nome, foto_url)")
            .eq("turma_id", turmaId)
            .eq("status", "ativo");
        if (anoId) q = q.eq("ano_letivo_id", anoId);
        var r = await q;
        if (r.error) throw r.error;
        var resultado = (r.data || []).map(function(m) {
            var a = m.alunos;
            if (!a) return null;
            /* Popula cache com aluno + matricula */
            _cacheAlunos[turmaId + "|" + a.nome] = { id: a.id, nome: a.nome, foto_url: a.foto_url || null, matricula_id: m.id };
            return { id: a.id, nome: a.nome, foto_url: a.foto_url || null, matricula_id: m.id, principal: m.principal };
        }).filter(Boolean).sort(function(a, b) { return a.nome.localeCompare(b.nome, "pt-BR"); });
        return resultado;
    } catch(e) { console.error("[sbBuscarAlunos]", e.message); return null; }
}

async function sbAdicionarAluno(nome, nomeTurma) {
    if (!window.sbClient) return null;
    try {
        var turmaId = await sbResolverTurmaId(nomeTurma);
        if (!turmaId) return null;
        var anoId = alGetAnoSelecionadoId();

        /* 1. Criar ou buscar aluno (dados permanentes — sem turma_id) */
        var alunoExist = await window.sbClient.from("alunos")
            .select("id,nome,foto_url").eq("nome", nome).maybeSingle();
        var alunoId;
        if (alunoExist.data) {
            alunoId = alunoExist.data.id;
        } else {
            var ins = await window.sbClient.from("alunos")
                .insert([{ nome: nome }]).select("id,nome").single();
            if (ins.error) throw ins.error;
            alunoId = ins.data.id;
        }

        /* 2. Criar matrícula neste ano+turma — upsert evita 409 se já existir */
        var matPayload = {
            aluno_id:      alunoId,
            turma_id:      turmaId,
            ano_letivo_id: anoId || null,
            status:        "ativo",
            principal:     true
        };
        /* onConflict aponta para o unique constraint do banco.
           Se já existir, faz NADA (ignoreSave) e retorna o registro existente. */
        var matIns = await window.sbClient.from("matriculas")
            .upsert([matPayload], {
                onConflict: "aluno_id,turma_id,ano_letivo_id",
                ignoreDuplicates: false
            }).select("id").single();
        if (matIns.error) {
            /* Fallback: se o upsert falhar por qualquer motivo, busca matrícula existente */
            if (matIns.error.code === "23505" || matIns.error.code === "409") {
                var matEx = await window.sbClient.from("matriculas")
                    .select("id").eq("aluno_id", alunoId).eq("turma_id", turmaId)
                    .eq("ano_letivo_id", anoId || null).single();
                if (matEx.data) {
                    _cacheAlunos[turmaId + "|" + nome] = { id: alunoId, nome: nome, matricula_id: matEx.data.id };
                    return { id: alunoId, nome: nome, matricula_id: matEx.data.id };
                }
            }
            throw matIns.error;
        }
        _cacheAlunos[turmaId + "|" + nome] = { id: alunoId, nome: nome, matricula_id: matIns.data.id };
        return { id: alunoId, nome: nome, matricula_id: matIns.data.id };
    } catch(e) { console.error("[sbAdicionarAluno]", e.message); return null; }
}

async function sbDeletarAluno(nomeAluno, nomeTurma) {
    if (!window.sbClient) return false;
    try {
        var turmaId = await sbResolverTurmaId(nomeTurma);
        if (!turmaId) return false;
        var anoId = alGetAnoSelecionadoId();
        /* Busca aluno */
        var ra = await window.sbClient.from("alunos")
            .select("id").eq("nome", nomeAluno).maybeSingle();
        if (!ra.data) return false;
        var alunoId = ra.data.id;
        /* Deleta matrícula deste ano+turma — CASCADE apaga lancamentos */
        var qd = window.sbClient.from("matriculas")
            .delete().eq("aluno_id", alunoId).eq("turma_id", turmaId);
        if (anoId) qd = qd.eq("ano_letivo_id", anoId);
        await qd;
        /* Se aluno não tem mais matrículas, apaga o registro permanente */
        var mRest = await window.sbClient.from("matriculas")
            .select("id").eq("aluno_id", alunoId);
        if (!mRest.data || mRest.data.length === 0) {
            await window.sbClient.from("alunos").delete().eq("id", alunoId);
        }
        /* Limpa TODAS as variações de cache deste aluno para evitar IDs fantasma */
        var anoId2 = alGetAnoSelecionadoId();
        delete _cacheAlunos[turmaId + "|" + nomeAluno];
        delete _cacheAlunos["mat|" + turmaId + "|" + (anoId2 || "") + "|" + nomeAluno];
        return true;
    } catch(e) { console.error("[sbDeletarAluno]", e.message); return false; }
}
 

/* ════════════════════════════════════════════════════════════════
   PROFESSORES — salvar foto na tabela fotos_professores
════════════════════════════════════════════════════════════════ */
async function sbSalvarFotoProfessor(professorId, fotoDataUrl) {
    if (!window.sbClient || !professorId || !fotoDataUrl) return null;
    try {
        /* 1. Converter para JPEG via Canvas (garante formato suportado pelo Supabase) */
        var jpegDataUrl = await new Promise(function(resolve, reject) {
            var img = new Image();
            img.onload = function() {
                var canvas = document.createElement("canvas");
                canvas.width  = img.naturalWidth;
                canvas.height = img.naturalHeight;
                var ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL("image/jpeg", 0.85));
            };
            img.onerror = function() { reject(new Error("Falha ao carregar imagem para conversão")); };
            img.src = fotoDataUrl;
        });

        /* 2. Upload do arquivo JPEG para o bucket "fotos" */
        var path = "professores/" + Date.now() + "_" + professorId + ".jpg";
        var blob = await (await fetch(jpegDataUrl)).blob();
        var upRes = await window.sbClient.storage
            .from("fotos").upload(path, blob,
                { contentType: "image/jpeg", upsert: true });
        if (upRes.error) throw upRes.error;

        /* 3. Obter URL pública */
        var pub = window.sbClient.storage.from("fotos").getPublicUrl(path);
        var url = pub.data.publicUrl;

        /* 4. Upsert na tabela fotos_professores */
        var upsRes = await window.sbClient
            .from("fotos_professores")
            .upsert({ usuario_id: professorId, foto: url, atualizado_em: new Date().toISOString() },
                    { onConflict: "usuario_id" });
        if (upsRes.error) throw upsRes.error;

        /* 5. Manter localStorage como cache local */
        localStorage.setItem("foto_usuario_" + professorId, fotoDataUrl);

        return url;
    } catch(e) {
        console.error("[sbSalvarFotoProfessor]", e.message);
        return null;
    }
}

async function sbCarregarFotoProfessor(professorId) {
    if (!window.sbClient || !professorId) return null;
    try {
        var r = await window.sbClient
            .from("fotos_professores")
            .select("foto")
            .eq("usuario_id", professorId)
            .maybeSingle();
        return (r.data && r.data.foto) || null;
    } catch(e) { return null; }
}

/* ════════════════════════════════════════════════════════════════
   ALUNOS — renomear e atualizar foto
════════════════════════════════════════════════════════════════ */
async function sbAtualizarFotoAluno(alunoId, fotoUrl) {
    if (!window.sbClient || !alunoId) return false;
    try {
        var r = await window.sbClient.from("alunos")
            .update({ foto_url: fotoUrl }).eq("id", alunoId);
        if (r.error) throw r.error;
        return true;
    } catch(e) { console.error("[sbAtualizarFotoAluno]", e.message); return false; }
}

/* ════════════════════════════════════════════════════════════════
   LANCAMENTOS — via matriculas
════════════════════════════════════════════════════════════════ */
async function sbBuscarLancamentos(nomeTurma, periodo) {
    if (!window.sbClient) return null;
    try {
        var turmaId = await sbResolverTurmaId(nomeTurma);
        if (!turmaId) return [];
        var anoId = alGetAnoSelecionadoId();

        /* Busca matrículas ativas desta turma+ano com dados do aluno e lançamentos */
        var q = window.sbClient.from("matriculas")
            .select("id, aluno_id, alunos(id, nome, foto_url), lancamentos!inner(periodo, hab_0, hab_1, hab_2, hab_3, hab_4, hab_5, hab_6, atualizado_em)")
            .eq("turma_id", turmaId)
            .eq("status", "ativo")
            .eq("lancamentos.periodo", periodo);
        if (anoId) q = q.eq("ano_letivo_id", anoId);
        var r = await q;
        if (r.error) throw r.error;

        /* Também busca matrículas sem lançamento ainda (para montar a lista completa de alunos) */
        var q2 = window.sbClient.from("matriculas")
            .select("id, aluno_id, alunos(id, nome, foto_url)")
            .eq("turma_id", turmaId).eq("status", "ativo");
        if (anoId) q2 = q2.eq("ano_letivo_id", anoId);
        var r2 = await q2;

        /* Monta mapa matricula → aluno */
        var mapaAlunos = {};
        (r2.data || []).forEach(function(m) {
            if (m.alunos) mapaAlunos[m.id] = { nome: m.alunos.nome, aluno_id: m.aluno_id };
            if (m.alunos) {
                var _ck = turmaId + "|" + m.alunos.nome;
                var _ex = _cacheAlunos[_ck];
                _cacheAlunos[_ck] = {
                    id: m.aluno_id,
                    nome: m.alunos.nome,
                    foto_url: m.alunos.foto_url || (_ex && _ex.foto_url) || null,
                    matricula_id: m.id
                };
            }
        });

        /* Monta resultado com aluno_nome para compatibilidade com código existente */
        var resultado = (r.data || []).map(function(m) {
            var inf = mapaAlunos[m.id] || {};
            var lanc = Array.isArray(m.lancamentos) ? m.lancamentos[0] : m.lancamentos;
            return Object.assign({}, lanc || {}, {
                matricula_id: m.id,
                aluno_id:     m.aluno_id,
                aluno_nome:   inf.nome || null
            });
        });
        return resultado;
    } catch(e) { console.error("[sbBuscarLancamentos]", e.message); return null; }
}

async function sbSalvarNota(nomeAluno, nomeTurma, periodo, habIdx, valor) {
    if (!window.sbClient) return false;
    try {
        var turmaId = await sbResolverTurmaId(nomeTurma);
        if (!turmaId) return false;

        var matriculaId = await sbResolverMatriculaId(nomeAluno, turmaId);
        if (!matriculaId) {
            console.warn("[sbSalvarNota] Matrícula não encontrada para", nomeAluno, nomeTurma);
            return false;
        }

        /* FIX: maybeSingle() em vez de single() — evita 406 quando ID é fantasma */
        var _matRow = await window.sbClient.from("matriculas")
            .select("aluno_id").eq("id", matriculaId).maybeSingle();
        var alunoId = (_matRow.data && _matRow.data.aluno_id) || null;

        /* FIX: cache fantasma — matriculaId não existe mais no banco */
        if (!alunoId) {
            console.warn("[sbSalvarNota] Cache fantasma detectado para", nomeAluno, "— invalidando...");
            var anoId = alGetAnoSelecionadoId();
            /* Limpa todas as variações de chave de cache deste aluno */
            var chave1 = "mat|" + turmaId + "|" + (anoId || "") + "|" + nomeAluno;
            var chave2 = turmaId + "|" + nomeAluno;
            delete _cacheAlunos[chave1];
            delete _cacheAlunos[chave2];
            /* Segunda tentativa com cache limpo */
            matriculaId = await sbResolverMatriculaId(nomeAluno, turmaId);
            if (!matriculaId) {
                console.warn("[sbSalvarNota] Matrícula não encontrada após reinvalidação:", nomeAluno);
                return false;
            }
            var _matRow2 = await window.sbClient.from("matriculas")
                .select("aluno_id").eq("id", matriculaId).maybeSingle();
            alunoId = (_matRow2.data && _matRow2.data.aluno_id) || null;
            if (!alunoId) {
                console.warn("[sbSalvarNota] alunoId ainda null após retentativa:", nomeAluno);
                return false;
            }
        }

        var payload = {
            matricula_id:  matriculaId,
            aluno_id:      alunoId,
            periodo:       periodo,
            atualizado_em: new Date().toISOString()
        };
        payload["hab_" + habIdx] = (valor === "" || valor === null) ? null : parseInt(valor);
        var r = await window.sbClient.from("lancamentos")
            .upsert([payload], { onConflict: "matricula_id,periodo" }).select().single();
        if (r.error) throw r.error;
        return true;
    } catch(e) { console.error("[sbSalvarNota]", e.message); return false; }
}

async function sbDeletarLancamentosPeriodo(nomeTurma, periodo) {
    if (!window.sbClient) return false;
    try {
        var turmaId = await sbResolverTurmaId(nomeTurma);
        if (!turmaId) return false;
        var anoId = alGetAnoSelecionadoId();
        /* Busca matriculas da turma+ano */
        var q = window.sbClient.from("matriculas")
            .select("id").eq("turma_id", turmaId);
        if (anoId) q = q.eq("ano_letivo_id", anoId);
        var rm = await q;
        if (rm.data && rm.data.length > 0) {
            var ids = rm.data.map(function(m) { return m.id; });
            await window.sbClient.from("lancamentos").delete()
                .in("matricula_id", ids).eq("periodo", periodo);
        }
        return true;
    } catch(e) { console.error("[sbDeletarLancamentosPeriodo]", e.message); return false; }
}
 
/* ════════════════════════════════════════════════════════════════
   ATIVIDADES
════════════════════════════════════════════════════════════════ */
async function buscarAtividades() {
    if (!window.sbClient) return null;
    try {
        var r = await window.sbClient.from("atividades")
            .select("*").order("criado_em", { ascending: false });
        if (r.error) throw r.error;
        return r.data;
    } catch(e) { console.error("[buscarAtividades]", e.message); return null; }
}
 
/* ════════════════════════════════════════════════════════════════
   STORAGE — Upload de arquivos de atividades
   Bucket público "atividades" — URLs permanentes, sem expiração
════════════════════════════════════════════════════════════════ */

/* Limites de tamanho por tipo de arquivo */
var ATV_LIMITES = {
    "application/pdf":  15 * 1024 * 1024,  /* 15MB */
    "image/":           8  * 1024 * 1024,  /* 8MB */
    "application/msword":                  10 * 1024 * 1024,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": 10 * 1024 * 1024
};

function sbValidarArquivo(file) {
    var limite = null;
    if (file.type === "application/pdf") {
        limite = ATV_LIMITES["application/pdf"];
    } else if (file.type.startsWith("image/")) {
        limite = ATV_LIMITES["image/"];
    } else {
        limite = ATV_LIMITES["application/msword"];
    }
    if (limite && file.size > limite) {
        var mb = Math.round(limite / 1024 / 1024);
        return { ok: false, msg: "Arquivo muito grande. Limite: " + mb + "MB para este tipo." };
    }
    return { ok: true };
}

/**
 * Upload de arquivo para o bucket público "atividades".
 * Retorna { url, path, nome, mime, tamanho } ou null se falhar.
 * Chama onProgress(porcentagem) se fornecido.
 */
async function sbUploadArquivoAtividade(file, usuarioId, onProgress) {
    if (!window.sbClient || !file) return null;
    try {
        var validacao = sbValidarArquivo(file);
        if (!validacao.ok) {
            if (typeof mostrarModalAviso === "function") mostrarModalAviso("Arquivo inválido", validacao.msg);
            return null;
        }

        var ts      = Date.now();
        var nome    = file.name.replace(/[^a-zA-Z0-9._\-]/g, "_");
        var uid     = usuarioId || "anon";
        var path    = uid + "/" + ts + "_" + nome;

        if (onProgress) onProgress(10);

        var r = await window.sbClient.storage
            .from("atividades")
            .upload(path, file, {
                contentType: file.type,
                upsert: false
            });

        if (r.error) throw r.error;

        if (onProgress) onProgress(90);

        /* URL pública permanente (bucket público) */
        var pub = window.sbClient.storage.from("atividades").getPublicUrl(path);
        var url = pub.data.publicUrl;

        if (onProgress) onProgress(100);

        return {
            url:     url,
            path:    path,
            nome:    file.name,
            mime:    file.type,
            tamanho: file.size
        };
    } catch(e) {
        console.error("[sbUploadArquivoAtividade]", e.message);
        return null;
    }
}

/**
 * Remover arquivo do Storage ao excluir uma atividade.
 * Extrai o path da URL pública para deletar corretamente.
 */
async function sbDeletarArquivoAtividade(arquivoUrl) {
    if (!window.sbClient || !arquivoUrl) return;
    try {
        /* Extrair path: URL pública termina com /storage/v1/object/public/atividades/PATH */
        var marker = "/storage/v1/object/public/atividades/";
        var idx    = arquivoUrl.indexOf(marker);
        if (idx === -1) return;
        var path = decodeURIComponent(arquivoUrl.slice(idx + marker.length));
        await window.sbClient.storage.from("atividades").remove([path]);
    } catch(e) {
        console.warn("[sbDeletarArquivoAtividade]", e.message);
    }
}

async function sbAtualizarArquivoAtividade(id, dados) {
    if (!window.sbClient || !isUUID(id)) return false;
    try {
        var upd = {
            arquivo_url:   dados.url     || null,
            nome_arquivo:  dados.nome    || null,
            mime_type:     dados.mime    || null,
            tamanho_bytes: dados.tamanho || null
        };
        var r = await window.sbClient.from("atividades").update(upd).eq("id", id);
        if (r.error) throw r.error;
        return true;
    } catch(e) { console.error("[sbAtualizarArquivoAtividade]", e.message); return false; }
}

async function criarAtividade(dados) {
    if (!window.sbClient) return null;
    try {
        var u = JSON.parse(localStorage.getItem("usuario_logado") || "{}");
        var payload = {
            criado_por:  u.id   || null,
            autor_nome:  dados.autor_nome || u.nome || null,
            nome:        dados.nome       || "",
            tipo:        dados.tipo       || null,
            nivel:       dados.nivel      || null,
            habilidade:  dados.habilidade || dados.hab  || null,
            descricao:   dados.descricao  || dados.desc || null,
            alunos_ids:  dados.alunos     || [],
            arquivo_url: dados.arquivo_url || dados.arquivo || null  /* link digital ou arquivo */
        };
        var r = await window.sbClient.from("atividades").insert([payload]).select().single();
        if (r.error) throw r.error;
        return r.data;
    } catch(e) { console.error("[criarAtividade]", e.message); return null; }
}
async function atualizarAtividade(id, dados) {
    if (!window.sbClient || !isUUID(id)) return null;
    try {
        var upd = {
            nome:       dados.nome       || "",
            tipo:       dados.tipo       || null,
            nivel:      dados.nivel      || null,
            habilidade: dados.habilidade || null,
            descricao:  dados.descricao  || null
        };
        /* Incluir arquivo_url apenas se explicitamente fornecido (link digital ou null para limpar) */
        if (Object.prototype.hasOwnProperty.call(dados, "arquivo_url")) {
            upd.arquivo_url = dados.arquivo_url;
        }
        var r = await window.sbClient
            .from("atividades").update(upd).eq("id", id).select().single();
        if (r.error) throw r.error;
        return r.data;
    } catch(e) { console.error("[atualizarAtividade]", e.message); return null; }
}
 
async function deletarAtividade(id, arquivoUrl) {
    if (!window.sbClient || !isUUID(id)) return false;
    try {
        /* Remover arquivo do Storage antes de deletar o registro */
        if (arquivoUrl) await sbDeletarArquivoAtividade(arquivoUrl);
        var r = await window.sbClient.from("atividades").delete().eq("id", id);
        if (r.error) throw r.error;
        return true;
    } catch(e) { console.error("[deletarAtividade]", e.message); return false; }
}
 
/* ════════════════════════════════════════════════════════════════
   ROTINAS
════════════════════════════════════════════════════════════════ */
async function sbBuscarRotinas() {
    if (!window.sbClient) return null;
    try {
        var anoId = alGetAnoSelecionadoId();
        var q = window.sbClient.from("rotinas")
            .select("*, turmas(nome)").order("criado_em", { ascending: false });
        if (anoId) q = q.eq("ano_letivo_id", anoId);
        var r = await q;
        if (r.error) throw r.error;
        // Extrai turmas_arr do JSON de celulas (compatibilidade retroativa)
        return r.data.map(function(row) {
            var cel = row.celulas;
            if (typeof cel === "string") { try { cel = JSON.parse(cel); } catch(e){ cel = {}; } }
            cel = cel || {};
            // Se tem __turmas_arr salvo no JSON, usa; senão usa turma do FK legado
            var turmasArr = cel.__turmas_arr || null;
            return Object.assign({}, row, {
                turmas_arr: turmasArr,
                celulas: cel
            });
        });
    } catch(e) { console.error("[sbBuscarRotinas]", e.message); return null; }
}
 
async function sbSalvarRotina(rotina) {
    if (!window.sbClient) return null;
    try {
        var u = JSON.parse(localStorage.getItem("usuario_logado") || "{}");
        // Suporte a múltiplas turmas: usa a 1ª para o FK legado + salva array em celulas
        var turmas = Array.isArray(rotina.turmas) ? rotina.turmas : (rotina.turma ? [rotina.turma] : []);
        var turmaLegado = turmas[0] || rotina.turma || null;
        var turmaId = turmaLegado ? await sbResolverTurmaId(turmaLegado) : null;
        var anoId   = alGetAnoSelecionadoId();
        // celulas já contém os dados; guarda turmas_arr dentro do JSON de celulas
        var celulas = Object.assign({}, rotina.celulas || {});
        celulas.__turmas_arr = turmas; // array persistido dentro do JSON
        var payload = {
            criado_por:    u.id              || null,
            professor:     rotina.professor  || null,
            turma_id:      turmaId,
            data_ini:      rotina.dataIni    || null,
            data_fim:      rotina.dataFim    || null,
            celulas:       celulas,
            ano_letivo_id: anoId             || null
        };
        var r;
        if (rotina.id && isUUID(String(rotina.id))) {
            r = await window.sbClient.from("rotinas").update(payload).eq("id", rotina.id).select().single();
        } else {
            r = await window.sbClient.from("rotinas").insert([payload]).select().single();
        }
        if (r.error) throw r.error;
        return r.data;
    } catch(e) { console.error("[sbSalvarRotina]", e.message); return null; }
}
 
async function sbDeletarRotina(id) {
    if (!window.sbClient || !isUUID(String(id))) return;
    try {
        var r = await window.sbClient.from("rotinas").delete().eq("id", id);
        if (r.error) throw r.error;
    } catch(e) { console.error("[sbDeletarRotina]", e.message); }
}
 
/* ════════════════════════════════════════════════════════════════
   ANOS LETIVOS
════════════════════════════════════════════════════════════════ */
async function sbBuscarAnosLetivos() {
    if (!window.sbClient) return null;
    try {
        var r = await window.sbClient.from("anos_letivos")
            .select("*").order("ano", { ascending: false });
        if (r.error) throw r.error;
        return r.data;
    } catch(e) { console.error("[sbBuscarAnosLetivos]", e.message); return null; }
}

async function sbCriarAnoLetivo(dados) {
    if (!window.sbClient) return null;
    try {
        var r = await window.sbClient.from("anos_letivos")
            .insert([dados]).select().single();
        if (r.error) throw r.error;
        return r.data;
    } catch(e) { console.error("[sbCriarAnoLetivo]", e.message); return null; }
}

async function sbAtivarAnoLetivo(id) {
    if (!window.sbClient) return false;
    try {
        /* Desativa todos */
        await window.sbClient.from("anos_letivos").update({ ativo: false }).neq("id", -1);
        /* Ativa o escolhido */
        var r = await window.sbClient.from("anos_letivos")
            .update({ ativo: true }).eq("id", id).select().single();
        if (r.error) throw r.error;
        /* Salva no localStorage para uso global */
        localStorage.setItem("av_ano_letivo_ativo", JSON.stringify(r.data));
        return r.data;
    } catch(e) { console.error("[sbAtivarAnoLetivo]", e.message); return false; }
}

async function sbDeletarAnoLetivo(id) {
    if (!window.sbClient || !id) return false;
    try {
        /* 1. Buscar todas as turmas do ano */
        var rTurmas = await window.sbClient.from("turmas")
            .select("id").eq("ano_letivo_id", id);
        var turmaIds = (rTurmas.data || []).map(function(t) { return t.id; });

        if (turmaIds.length > 0) {
            /* 2. Coletar aluno_ids das matrículas ANTES de apagá-las */
            var rMats = await window.sbClient.from("matriculas")
                .select("aluno_id").in("turma_id", turmaIds);
            var alunoIds = (rMats.data || []).map(function(m) { return m.aluno_id; }).filter(Boolean);

            /* 3. Apagar rotinas e vínculos de professor de todas as turmas */
            await window.sbClient.from("rotinas").delete().in("turma_id", turmaIds);
            await window.sbClient.from("professor_turmas").delete().in("turma_id", turmaIds);

            /* 4. Apagar matrículas — CASCADE apaga lançamentos automaticamente */
            await window.sbClient.from("matriculas").delete().in("turma_id", turmaIds);

            /* 5. Apagar alunos que não têm matrícula em nenhuma outra turma */
            for (var i = 0; i < alunoIds.length; i++) {
                var aid = alunoIds[i];
                var outras = await window.sbClient.from("matriculas")
                    .select("id").eq("aluno_id", aid);
                if (!outras.data || outras.data.length === 0) {
                    await window.sbClient.from("alunos").delete().eq("id", aid);
                }
            }

            /* 6. Apagar as turmas do ano */
            await window.sbClient.from("turmas").delete().in("id", turmaIds);

            /* 7. Limpar cache de turmas removidas */
            Object.keys(_cacheTurmas).forEach(function(nome) {
                var t = _cacheTurmas[nome];
                if (t && turmaIds.indexOf(t.id) !== -1) delete _cacheTurmas[nome];
            });
        }

        /* 8. Apagar o ano letivo */
        var r = await window.sbClient.from("anos_letivos").delete().eq("id", id);
        if (r.error) throw r.error;
        return true;
    } catch(e) { console.error("[sbDeletarAnoLetivo]", e.message); return false; }
}

function getAnoLetivoAtivo() {
    try {
        var s = localStorage.getItem("av_ano_letivo_ativo");
        return s ? JSON.parse(s) : null;
    } catch(e) { return null; }
}

/* ════════════════════════════════════════════════════════════════
   SYS CONFIG
════════════════════════════════════════════════════════════════ */
async function sbSalvarSysConfig(cfg) {
    if (!window.sbClient) return;
    try {
        await window.sbClient.from("sys_config")
            .upsert([{ id: 1, config: cfg, atualizado_em: new Date().toISOString() }],
                    { onConflict: "id" });
    } catch(e) { console.warn("[sbSalvarSysConfig]", e.message); }
}
 
async function sbCarregarSysConfig() {
    if (!window.sbClient) return null;
    try {
        var r = await window.sbClient.from("sys_config")
            .select("config").eq("id", 1).maybeSingle();
        return (r.data && r.data.config) ? r.data.config : null;
    } catch(e) { return null; }
}
 
/* ════════════════════════════════════════════════════════════════
   SINCRONIZACAO TOTAL
════════════════════════════════════════════════════════════════ */
async function sbSincronizarTudo() {
    if (!window.sbOnline) return;
    if (typeof _compSincronizando !== "undefined") _compSincronizando = true;
    var anoId = alGetAnoSelecionadoId();
    console.log("[SB] Sincronizando... (ano:", anoId, ")");

    /* Turmas — filtradas por ano selecionado + role */
    try {
        var u = JSON.parse(localStorage.getItem("usuario_logado") || "{}");
        var anoId = alGetAnoSelecionadoId();
        var turmasArr = [];

        if (u.role === "professor") {
            /* Professor: só turmas com vínculo ATIVO no ano selecionado */
            turmasArr = await sbBuscarTurmasDoProfessor(u.id);
            /* Sem turmas no ano = ano não configurado ainda, não herda nada */
            if (turmasArr.length === 0) {
                console.log("[SB] Professor sem turmas no ano", anoId, "— iniciando vazio");
            }
        } else {
            /* Admin e supervisora: todas do ano selecionado */
            var t = await sbBuscarTurmas();
            if (t) turmasArr = t;
        }

        /* Limpa storage antes de salvar o novo conjunto */
        localStorage.removeItem("turmas_lista");
        if (turmasArr.length > 0) {
            salvarTurmasStorage(turmasArr.map(function(t) {
                return {
                    id:            t.id,
                    nome:          (t.nome || "").trim(),
                    turno:         t.turno || "Matutino",
                    ano_letivo_id: t.ano_letivo_id,
                    tipo_vinculo:  t.tipo_vinculo || "titular",
                    oculta:        t.oculta === true   /* preserva campo de visibilidade */
                };
            }));
        }
        inicializarTurmas();
    } catch(e) { console.warn("[SB] Turmas nao sincronizadas:", e.message); }

    /* OPÇÃO C corrigida — Sincronização em duas etapas:
       Etapa 1: matriculados do banco → só completa períodos que JÁ têm alunos no local
                (nunca cria lista em período vazio — respeita que aluno pertence a período específico)
       Etapa 2: lançamentos → mescla notas sem substituir lista
    */

    /* ── ETAPA 1: Matriculados → garante que alunos aparecem mesmo sem lançamento ──
       Escreve APENAS no período atual selecionado para não vazar entre períodos.
       Se o localStorage estiver vazio (outro dispositivo), cria a lista com os do banco. */
    try {
        var turmas = getTurmasStorage();
        var periodoAtual = normalizarPeriodo(typeof getPeriodo === "function" ? getPeriodo() : (periodosArr[0] ? periodosArr[0].v : "DIAG"));
        for (var ti = 0; ti < turmas.length; ti++) {
            var tObj      = turmas[ti];
            var nomeTurma = normalizarTurma((typeof tObj === "object") ? tObj.nome : tObj);
            try {
                var matriculados = await sbBuscarAlunos(nomeTurma);
                if (matriculados && matriculados.length > 0) {
                    var nomesMatric = matriculados.map(function(m) { return normalizarAluno(m.nome); }).filter(Boolean);
                    /* Escreve APENAS no período atual — sem vazar para outros períodos */
                    var chave   = chaveAlunos(nomeTurma, periodoAtual);
                    var jaLocal = JSON.parse(localStorage.getItem(chave) || "[]");
                    var unidos  = Array.from(new Set(nomesMatric.concat(jaLocal)))
                        .filter(Boolean)
                        .sort(function(a, b) { return a.localeCompare(b, "pt-BR"); });
                    localStorage.setItem(chave, JSON.stringify(unidos));
                }
            } catch(eM) { console.warn("[SB] Matriculados nao carregados para", nomeTurma, eM.message); }
        }
        console.log("[SB] Matriculados sincronizados.");
    } catch(e) { console.warn("[SB] Etapa matriculados falhou:", e.message); }

    /* ── ETAPA 2: Lançamentos → mescla sem substituir lista de alunos ── */
    try {
        var turmas = getTurmasStorage();
        for (var ti = 0; ti < turmas.length; ti++) {
            for (var pi = 0; pi < periodosArr.length; pi++) {
                var tObj      = turmas[ti];
                var nomeTurma = normalizarTurma((typeof tObj === "object") ? tObj.nome : tObj);
                var periodo   = normalizarPeriodo(periodosArr[pi].v);
                try {
                    var lancs = await sbBuscarLancamentos(nomeTurma, periodo);
                    if (lancs && lancs.length > 0) {
                        var nomesLanc = lancs.map(function(l) { return normalizarAluno(l.aluno_nome); })
                            .filter(Boolean);
                        /* MESCLA com lista existente — nunca substitui */
                        var chave   = chaveAlunos(nomeTurma, periodo);
                        var jaLocal = JSON.parse(localStorage.getItem(chave) || "[]");
                        var mesclado = Array.from(new Set(jaLocal.concat(nomesLanc)))
                            .filter(Boolean)
                            .sort(function(a, b) { return a.localeCompare(b, "pt-BR"); });
                        localStorage.setItem(chave, JSON.stringify(mesclado));
                        /* Salva as notas */
                        lancs.forEach(function(l) {
                            var nomeAluno = normalizarAluno(l.aluno_nome);
                            if (!nomeAluno) return;
                            for (var hi = 0; hi < 7; hi++) {
                                var val = l["hab_" + hi];
                                var key = chaveNota(nomeTurma, periodo, nomeAluno, hi);
                                if (val !== null && val !== undefined) localStorage.setItem(key, String(val));
                                else localStorage.removeItem(key);
                            }
                        });
                    }
                    /* Se lancs = []: não toca na lista local */
                } catch(e2) { console.warn("[SB] Erro lancamentos", periodo, nomeTurma, e2.message); }
            }
        }
        console.log("[SB] Lancamentos sincronizados.");
    } catch(e) { console.warn("[SB] Lancamentos nao sincronizados:", e.message); }
 
    /* Ano Letivo ativo */
    try {
        var anos = await sbBuscarAnosLetivos();
        if (anos && anos.length > 0) {
            var anoAtivo = anos.find(function(a){ return a.ativo; });
            if (anoAtivo) localStorage.setItem("av_ano_letivo_ativo", JSON.stringify(anoAtivo));
            /* Atualiza badge no header */
            if (typeof alAtualizarBadgeHeader === "function") {
                if (typeof _alAnos !== "undefined") _alAnos = anos;
                alAtualizarBadgeHeader();
            }
        }
    } catch(e) { console.warn("[SB] Ano letivo nao carregado:", e.message); }

    /* Sys config */
    try {
        var cfgR = await sbCarregarSysConfig();
        if (cfgR) { localStorage.setItem("av_sys_config", JSON.stringify(cfgR)); sysAplicar(cfgR); }
    } catch(e) {}
 
    console.log("[SB] Sincronizacao concluida v");
    if (typeof _compSincronizando !== "undefined") _compSincronizando = false;
}
/* ════════════════════════════════════════════════════════════════
   TELEMETRIA — Sessões e Tempo Ativo Real (v2.0)
   ────────────────────────────────────────────────────────────────
   COMO O CÁLCULO FUNCIONA:
   Em vez de medir "tempo de sessão aberta" (Date.now() - login),
   o sistema acumula apenas intervalos onde o usuário estava
   simultaneamente ativo E com a aba visível.

   EVENTOS QUE CONTAM COMO ATIVIDADE:
   click, mousedown, keydown, touchstart, scroll, trocarAba
   (qualquer interação física com a página)

   REGRAS:
   1. Aba oculta/minimizada → contagem pausada imediatamente
   2. Aba volta ao foco     → retoma contagem SÓ se houve atividade
   3. 5 min sem interação   → usuário marcado inativo, contagem pausa
   4. Nova interação        → reativa contagem

   ACUMULADOR:
   _telSegundosAtivos  — segundos reais acumulados nesta sessão
   _telInicioIntervalo — timestamp do início do intervalo ativo atual
                         (null quando pausado)

   HEARTBEAT (3 minutos):
   Grava _telSegundosAtivos no banco periodicamente para que
   fechamentos abruptos não percam o tempo já acumulado.
   Não cria novos timers — reutiliza o setInterval existente.
════════════════════════════════════════════════════════════════ */

/* ── Estado da sessão ── */
window._telSessaoId        = null;
window._telSegundosAtivos  = 0;       /* acumulador de tempo ativo real  */
window._telInicioIntervalo = null;    /* início do intervalo ativo atual */
window._telUltimaAtividade = 0;       /* timestamp da última interação   */
window._telHeartbeatTimer  = null;
window._telListenersAtivos = false;

var _TEL_INATIVIDADE_MS = 5 * 60 * 1000; /* 5 minutos */

/* ── Encerra o intervalo ativo atual e acumula o tempo ── */
function _telFecharIntervalo() {
    if (window._telInicioIntervalo !== null) {
        var delta = Math.round((Date.now() - window._telInicioIntervalo) / 1000);
        if (delta > 0) window._telSegundosAtivos += delta;
        window._telInicioIntervalo = null;
    }
}

/* ── Abre um novo intervalo ativo (só se aba visível) ── */
function _telAbrirIntervalo() {
    if (document.visibilityState !== "visible") return;
    if (window._telInicioIntervalo === null) {
        window._telInicioIntervalo = Date.now();
    }
}

/* ── Handler de atividade do usuário ── */
function _telRegistrarAtividade() {
    window._telUltimaAtividade = Date.now();
    /* Se estava inativo (sem intervalo aberto), reabre */
    _telAbrirIntervalo();
}

/* ── Verificação periódica de inatividade (dentro do heartbeat) ── */
function _telVerificarInatividade() {
    if (window._telInicioIntervalo === null) return; /* já pausado */
    var inativo = (Date.now() - window._telUltimaAtividade) >= _TEL_INATIVIDADE_MS;
    if (inativo) {
        _telFecharIntervalo(); /* pausa sem resetar _telSegundosAtivos */
    }
}

/* ── Listener de visibilidade da aba ── */
function _telOnVisibilidade() {
    if (document.visibilityState === "hidden") {
        _telFecharIntervalo(); /* aba minimizada: pausa contagem */
    } else {
        /* Aba voltou: só abre intervalo se houve atividade recente */
        var recente = (Date.now() - window._telUltimaAtividade) < _TEL_INATIVIDADE_MS;
        if (recente) _telAbrirIntervalo();
    }
}

/* ── Instala os listeners de atividade (uma vez por sessão) ── */
function _telInstalarListeners() {
    if (window._telListenersAtivos) return;
    var eventos = ["click", "mousedown", "keydown", "touchstart", "scroll"];
    eventos.forEach(function(ev) {
        document.addEventListener(ev, _telRegistrarAtividade, { passive: true, capture: true });
    });
    document.addEventListener("visibilitychange", _telOnVisibilidade);
    window._telListenersAtivos = true;
}

/* ── Remove os listeners ao encerrar sessão ── */
function _telRemoverListeners() {
    if (!window._telListenersAtivos) return;
    var eventos = ["click", "mousedown", "keydown", "touchstart", "scroll"];
    eventos.forEach(function(ev) {
        document.removeEventListener(ev, _telRegistrarAtividade, { capture: true });
    });
    document.removeEventListener("visibilitychange", _telOnVisibilidade);
    window._telListenersAtivos = false;
}

/* ────────────────────────────────────────────────────────────
   sbTelIniciarSessao(usuario)
   Cria registro em acessos_sistema e inicia monitoramento.
──────────────────────────────────────────────────────────── */
async function sbTelIniciarSessao(usuario) {
    if (!window.sbClient || !window.sbOnline || !usuario || !usuario.id) return;

    /* Limpa estado anterior */
    if (window._telHeartbeatTimer) { clearInterval(window._telHeartbeatTimer); window._telHeartbeatTimer = null; }
    _telRemoverListeners();

    window._telSegundosAtivos  = 0;
    window._telInicioIntervalo = null;
    window._telUltimaAtividade = Date.now();

    try {
        var agora = new Date().toISOString();
        var r = await window.sbClient
            .from("acessos_sistema")
            .insert([{ usuario_id: usuario.id, login_em: agora, tipo_encerramento: "desconectado" }])
            .select("id")
            .single();
        if (r.error) throw r.error;
        window._telSessaoId = r.data.id;

        /* Começa a contar imediatamente (aba visível + usuário acabou de logar) */
        _telAbrirIntervalo();
        _telInstalarListeners();

        /* Heartbeat a cada 3 minutos:
           1. Verifica inatividade
           2. Acumula intervalo corrente
           3. Grava no banco
           4. Reabre intervalo (se ainda ativo) */
        window._telHeartbeatTimer = setInterval(async function() {
            if (!window._telSessaoId || !window.sbOnline) return;
            _telVerificarInatividade();
            _telFecharIntervalo();
            var total = window._telSegundosAtivos;
            if (document.visibilityState === "visible") {
                var recente = (Date.now() - window._telUltimaAtividade) < _TEL_INATIVIDADE_MS;
                if (recente) _telAbrirIntervalo(); /* reabre para continuar acumulando */
            }
            try {
                await window.sbClient
                    .from("acessos_sistema")
                    .update({
                        logout_em:            new Date().toISOString(),
                        tempo_total_segundos: total,
                        tipo_encerramento:    "desconectado"
                    })
                    .eq("id", window._telSessaoId);
            } catch(e) { /* silencioso */ }
        }, 180000); /* 3 minutos */

    } catch(e) {
        console.warn("[tel] Erro ao iniciar sessão:", e.message);
    }
}

/* ────────────────────────────────────────────────────────────
   sbTelEncerrarSessao(tipo)
   Fecha o intervalo ativo, grava o total real e limpa tudo.
──────────────────────────────────────────────────────────── */
async function sbTelEncerrarSessao(tipo) {
    /* Para heartbeat e fecha intervalo ativo antes de tudo */
    if (window._telHeartbeatTimer) { clearInterval(window._telHeartbeatTimer); window._telHeartbeatTimer = null; }
    _telFecharIntervalo();
    _telRemoverListeners();

    if (!window.sbClient || !window.sbOnline || !window._telSessaoId) {
        window._telSessaoId = null; window._telSegundosAtivos = 0;
        return;
    }
    try {
        var payload = {
            logout_em:            new Date().toISOString(),
            tempo_total_segundos: window._telSegundosAtivos,
            tipo_encerramento:    tipo || "desconectado"
        };
        var r = await window.sbClient
            .from("acessos_sistema")
            .update(payload)
            .eq("id", window._telSessaoId);
        if (r.error) throw r.error;
        window._telSessaoId       = null;
        window._telSegundosAtivos = 0;
    } catch(e) {
        console.warn("[tel] Erro ao encerrar sessão:", e.message);
    }
}

/* ────────────────────────────────────────────────────────────
   sbTelLimparRanking()
   Zera acessos_sistema — requer confirmação na UI.
──────────────────────────────────────────────────────────── */
async function sbTelLimparRanking() {
    if (!window.sbClient || !window.sbOnline) return false;
    try {
        var r = await window.sbClient
            .from("acessos_sistema")
            .delete()
            .neq("id", "00000000-0000-0000-0000-000000000000"); /* deleta tudo */
        if (r.error) throw r.error;
        window._telSessaoId = null;
        window._telLoginEm  = null;
        return true;
    } catch(e) {
        console.warn("[tel] Erro ao limpar ranking:", e.message);
        return false;
    }
}

/* ────────────────────────────────────────────────────────────
   sbTelObterEstatisticas()
   Retorna ranking de acessos e ranking de tempo.
   Faz duas queries simples — sem funções RPC.
──────────────────────────────────────────────────────────── */
async function sbTelObterEstatisticas() {
    if (!window.sbClient || !window.sbOnline) return null;
    try {
        /* Busca todos os registros de acessos com dados do usuário */
        var r = await window.sbClient
            .from("acessos_sistema")
            .select("usuario_id, tempo_total_segundos, login_em, app_users(nome)")
            .order("login_em", { ascending: false });
        if (r.error) throw r.error;

        /* Agrega por usuário em memória — evita RPC/funções no banco */
        var mapa = {};
        (r.data || []).forEach(function(row) {
            var uid  = row.usuario_id;
            var nome = (row.app_users && row.app_users.nome) ? row.app_users.nome : "Usuário";
            if (!mapa[uid]) mapa[uid] = { nome: nome, acessos: 0, segundos: 0, ultimo: null };
            mapa[uid].acessos++;
            mapa[uid].segundos += (row.tempo_total_segundos || 0);
            if (!mapa[uid].ultimo || row.login_em > mapa[uid].ultimo) {
                mapa[uid].ultimo = row.login_em;
            }
        });

        var lista = Object.keys(mapa).map(function(uid) { return mapa[uid]; });

        /* Ranking por acessos */
        var rankAcessos = lista.slice().sort(function(a,b) { return b.acessos - a.acessos; }).slice(0, 10);

        /* Ranking por tempo */
        var rankTempo = lista.slice().sort(function(a,b) { return b.segundos - a.segundos; }).slice(0, 10);

        return { rankAcessos: rankAcessos, rankTempo: rankTempo };
    } catch(e) {
        console.warn("[tel] Erro ao obter estatísticas:", e.message);
        return null;
    }
}

/* ════════════════════════════════════════════════════════════════
   MENSAGENS — Supabase (v1.0)
   Lê/escreve em mensagens_loading e mensagens_visualizadas.
════════════════════════════════════════════════════════════════ */

/* Busca todas as mensagens ativas de um período */
async function sbMsgBuscarPorPeriodo(periodo) {
    if (!window.sbClient || !window.sbOnline) return null;
    try {
        var r = await window.sbClient
            .from("mensagens_loading")
            .select("id, texto, categoria, periodo, ativo")
            .eq("ativo", true)
            .in("periodo", [periodo, "todas"])
            .order("criado_em");
        if (r.error) throw r.error;
        return r.data || [];
    } catch(e) {
        console.warn("[msg] Erro ao buscar mensagens:", e.message);
        return null;
    }
}

/* Busca todas as mensagens (para admin) */
async function sbMsgBuscarTodas() {
    if (!window.sbClient || !window.sbOnline) return null;
    try {
        var r = await window.sbClient
            .from("mensagens_loading")
            .select("id, texto, categoria, periodo, ativo, criado_em")
            .order("periodo")
            .order("criado_em");
        if (r.error) throw r.error;
        return r.data || [];
    } catch(e) {
        console.warn("[msg] Erro ao buscar todas as mensagens:", e.message);
        return null;
    }
}

/* Contagem de visualizações por mensagem (para ciclo) */
async function sbMsgContarVisualizacoes(ids) {
    if (!window.sbClient || !window.sbOnline || !ids || !ids.length) return {};
    try {
        var r = await window.sbClient
            .from("mensagens_visualizadas")
            .select("mensagem_id")
            .in("mensagem_id", ids);
        if (r.error) throw r.error;
        var contagem = {};
        (r.data || []).forEach(function(v) {
            contagem[v.mensagem_id] = (contagem[v.mensagem_id] || 0) + 1;
        });
        return contagem;
    } catch(e) {
        console.warn("[msg] Erro ao contar visualizações:", e.message);
        return {};
    }
}

/* Verifica se um usuário específico já visualizou uma mensagem */
async function sbMsgUsuarioJaViu(mensagemId, usuarioId) {
    if (!window.sbClient || !window.sbOnline || !mensagemId || !usuarioId) return false;
    try {
        var r = await window.sbClient
            .from("mensagens_visualizadas")
            .select("id", { count: "exact", head: true })
            .eq("mensagem_id", mensagemId)
            .eq("usuario_id", usuarioId)
            .limit(1);
        if (r.error) throw r.error;
        return (r.count || 0) > 0;
    } catch(e) {
        console.warn("[msg] Erro ao verificar visualização:", e.message);
        return false;
    }
}

/* Registra uma visualização */
async function sbMsgRegistrarVisualizacao(mensagemId, usuarioId) {
    if (!window.sbClient || !window.sbOnline || !mensagemId || !usuarioId) return;
    try {
        await window.sbClient
            .from("mensagens_visualizadas")
            .insert([{ mensagem_id: mensagemId, usuario_id: usuarioId }]);
    } catch(e) {
        console.warn("[msg] Erro ao registrar visualização:", e.message);
    }
}

/* CRUD de mensagens (admin) */
async function sbMsgCriar(dados) {
    if (!window.sbClient) return null;
    try {
        var r = await window.sbClient
            .from("mensagens_loading")
            .insert([{
                texto:     dados.texto.trim(),
                categoria: dados.categoria || "normal",
                periodo:   dados.periodo   || "manha",
                ativo:     dados.ativo !== false
            }])
            .select().single();
        if (r.error) throw r.error;
        return r.data;
    } catch(e) { console.warn("[msg] Erro ao criar:", e.message); return null; }
}

async function sbMsgEditar(id, dados) {
    if (!window.sbClient) return false;
    try {
        var upd = {};
        if (dados.texto     !== undefined) upd.texto     = dados.texto.trim();
        if (dados.categoria !== undefined) upd.categoria = dados.categoria;
        if (dados.periodo   !== undefined) upd.periodo   = dados.periodo;
        if (dados.ativo     !== undefined) upd.ativo     = dados.ativo;
        var r = await window.sbClient
            .from("mensagens_loading").update(upd).eq("id", id);
        if (r.error) throw r.error;
        return true;
    } catch(e) { console.warn("[msg] Erro ao editar:", e.message); return false; }
}

async function sbMsgExcluir(id) {
    if (!window.sbClient) return false;
    try {
        var r = await window.sbClient
            .from("mensagens_loading").delete().eq("id", id);
        if (r.error) throw r.error;
        return true;
    } catch(e) { console.warn("[msg] Erro ao excluir:", e.message); return false; }
}

/* Estatísticas de mensagens: total, ativas, visualizações */
async function sbMsgEstatisticas() {
    if (!window.sbClient || !window.sbOnline) return null;
    try {
        var rm = await window.sbClient
            .from("mensagens_loading").select("id, ativo", { count: "exact" });
        var rv = await window.sbClient
            .from("mensagens_visualizadas").select("id", { count: "exact" });
        return {
            total:    rm.count  || 0,
            ativas:   (rm.data || []).filter(function(m) { return m.ativo; }).length,
            totalViz: rv.count  || 0
        };
    } catch(e) { console.warn("[msg] Erro em estatísticas:", e.message); return null; }
}

/* Ranking de usuários por mensagens visualizadas */
async function sbMsgRankingVisualizacoes(limite) {
    if (!window.sbClient || !window.sbOnline) return [];
    try {
        var r = await window.sbClient
            .from("mensagens_visualizadas")
            .select("usuario_id, app_users(nome), visualizada_em")
            .order("visualizada_em", { ascending: false });
        if (r.error) throw r.error;
        var mapa = {};
        (r.data || []).forEach(function(v) {
            var uid  = v.usuario_id;
            var nome = (v.app_users && v.app_users.nome) ? v.app_users.nome : "Usuário";
            if (!mapa[uid]) mapa[uid] = { nome: nome, total: 0, ultimo: null };
            mapa[uid].total++;
            if (!mapa[uid].ultimo) mapa[uid].ultimo = v.visualizada_em;
        });
        return Object.keys(mapa)
            .map(function(uid) { return mapa[uid]; })
            .sort(function(a,b) { return b.total - a.total; })
            .slice(0, limite || 10);
    } catch(e) { console.warn("[msg] Erro no ranking:", e.message); return []; }
}

/* Busca mensagem padrão/evento ativa (categoria = "padrao") */
async function sbMsgObterPadrao() {
    if (!window.sbClient || !window.sbOnline) return null;
    try {
        var r = await window.sbClient
            .from("mensagens_loading")
            .select("id, texto, categoria, periodo, ativo")
            .eq("categoria", "padrao")
            .eq("ativo", true)
            .order("criado_em", { ascending: false })
            .limit(1)
            .maybeSingle();
        if (r.error) throw r.error;
        return r.data || null;
    } catch(e) { console.warn("[msg] Erro ao buscar padrão:", e.message); return null; }
}