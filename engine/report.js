// Reporte Markdown (para GitHub / Jira). Distingue siempre hipótesis, hechos ejecutados y propuestas.
const fence = (t, lang = '') => '```' + lang + '\n' + t + '\n```';
const ICON = { PASS: 'PASS', FAIL: 'FAIL', ERROR: 'ERROR' };

function checksTable(run) {
  const rows = run.results.map((r) => `| ${r.id} | ${r.criterion ?? r.title} | **${ICON[r.status]}** | ${r.error ? r.error.message.split('\n')[0].replace(/\|/g, '\\|') : ''} |`);
  return ['| Prueba | Criterio | Resultado | Detalle |', '|---|---|---|---|', ...rows].join('\n');
}

const sections = {
  requirements(d) {
    const list = (a) => (a.length ? a.map((x) => `- ${x}`).join('\n') : '_(pendiente)_');
    return [
      `**Objetivo:** ${d.objective}`, `**Actor:** ${d.actor || '_(pendiente)_'}`, `**Comportamiento esperado:** ${d.expectedBehavior || '_(pendiente)_'}`,
      `### Datos de entrada\n${list(d.inputs)}`, `### Reglas acordadas\n${list(d.rules)}`, `### Errores\n${list(d.errors)}`, `### Criterios de aceptación\n${list(d.acceptance)}`, `### Casos límite\n${list(d.edgeCases ?? [])}`,
      d.questions?.length ? `### Preguntas pendientes\n${d.questions.map((q) => `- ${q.text}`).join('\n')}` : '',
      d.approval ? `**Aprobado por:** ${d.approval.by} (${d.approval.at})\n\nHash del contenido aprobado: \`${d.approval.hash.slice(0, 16)}…\`` : '**Sin aprobación humana todavía: no se generan pruebas.**',
    ].filter(Boolean).join('\n\n');
  },
  verify(d) {
    const parts = [];
    const runs = d.runs ?? [];
    for (const run of runs) {
      parts.push(`### Resultado sobre \`${run.target === 'buggy' ? 'demo-store (con el error)' : 'demo-store-fixed (corregida)'}\`\n\nPASS ${run.summary.pass} · FAIL ${run.summary.fail} · ERROR ${run.summary.error} · ${run.durationMs} ms\n\n${checksTable(run)}`);
    }
    if (runs.length === 2) {
      const [a, b] = runs;
      const diff = a.results.filter((r) => r.status !== 'PASS').map((r) => `- ${r.id}: ${r.status} → ${b.results.find((x) => x.id === r.id)?.status ?? '?'}`);
      parts.push(`### Antes / después\n${diff.join('\n') || 'Sin fallos antes de la corrección.'}`);
    }
    for (const r of runs[0]?.results.filter((x) => x.error) ?? []) parts.push(`### Traza real: ${r.id}\n${fence(r.error.stack)}`);
    return parts.join('\n\n');
  },
  debug(d) {
    const g = d.diagnosis;
    const parts = [`**Error:** \`${g.error.name}: ${g.error.message}\``, `**Archivos candidatos:** ${g.candidateFiles.map((f) => `\`${f}\``).join(', ') || '_(ninguno del proyecto)_'}`];
    if (g.snippet) parts.push(`### Código en ${g.snippet.file}\n${fence(g.snippet.lines.map((l) => `${l.hit ? '>' : ' '} ${String(l.line).padStart(3)} | ${l.text}`).join('\n'))}`);
    parts.push('### Hipótesis (ordenadas por confianza heurística)');
    for (const h of g.hypotheses) {
      parts.push(`#### ${h.id} · ${h.title}\n- **Estado:** \`${h.status}\` — confianza heurística: ${h.confidence}\n- ${h.statement}\n- **Evidencia:**\n${h.evidence.map((e) => `  - \`${e.file}:${e.line}\` — ${e.why}\n    ${fence(e.text).replace(/\n/g, '\n    ')}`).join('\n')}${h.suggestedFix ? `\n- **Corrección propuesta (no aplicada):** ${h.suggestedFix}` : ''}`);
    }
    parts.push(g.reproduction?.reproduced
      ? `### Reproducción\nLa prueba \`${g.reproduction.checkId}\` (${g.reproduction.title}) falla con el mismo error:\n${fence(g.reproduction.trace)}`
      : `### Reproducción\n${g.reproduction?.note ?? 'No se intentó reproducir.'}`);
    if (g.fixVerification) parts.push(`### Confirmación antes / después\nCon la versión corregida (\`${g.fixVerification.target}\`), \`${g.fixVerification.checkId}\` ${g.fixVerification.passedAfterFix ? '**PASA**' : '**sigue fallando**'}.`);
    return parts.join('\n\n');
  },
  explain(d) {
    const e = d.explanation;
    return [
      `**Función:** \`${e.symbol}(${e.params.join(', ')})\` en \`${e.file}:${e.lines[0]}-${e.lines[1]}\`${e.exported ? ' (exportada)' : ''}`,
      '### Flujo', e.flow.map((f) => `- \`${e.file}:${f.line}\` **${f.kind}** — ${f.note}\n  \`${f.text}\``).join('\n'),
      '### Quién la llama', e.callers.length ? e.callers.map((c) => `- \`${c.file}:${c.line}\` \`${c.text}\``).join('\n') : '_(ningún llamador en el proyecto)_',
      '### Código', fence(e.source.map((l) => `${String(l.line).padStart(3)} | ${l.text}`).join('\n'), 'js'), `_${e.note}_`,
    ].join('\n\n');
  },
  review(d) {
    const fs = d.findings;
    const c = (s) => fs.filter((f) => f.severity === s).length;
    const parts = [`Hallazgos: **${fs.length}** (alta ${c('alta')} · media ${c('media')} · baja ${c('baja')}) — demostrados por pruebas: ${fs.filter((f) => f.kind === 'demostrado').length}`,
      '| ID | Severidad | Tipo | Regla | Ubicación | Estado |', '|---|---|---|---|---|---|',
      ...fs.map((f) => `| ${f.id} | ${f.severity} | ${f.category} | ${f.rule} | \`${f.file}:${f.lines[0]}${f.lines[1] !== f.lines[0] ? `-${f.lines[1]}` : ''}\` | ${f.kind}${f.demonstratedBy.length ? ` (${f.demonstratedBy.join(', ')})` : ''} |`)];
    for (const f of fs) parts.push(`#### ${f.id} · ${f.rule} (${f.severity})\n- **Ubicación:** \`${f.file}:${f.lines[0]}${f.lines[1] !== f.lines[0] ? `-${f.lines[1]}` : ''}\`\n- **Evidencia:** \`${f.evidence}\`\n- **Impacto posible:** ${f.impact}\n- **Recomendación:** ${f.recommendation}\n- **Estado:** ${f.kind === 'demostrado' ? `demostrado por ${f.demonstratedBy.join(', ')}` : 'potencial (detectado por regla estática; no hay una prueba ejecutada que lo demuestre)'}`);
    return parts.join('\n\n');
  },
};

export function renderReport(rec) {
  return [
    `# ${rec.title}`,
    `| Tipo | Estado | Fecha |\n|---|---|---|\n| ${rec.type} | ${rec.status} | ${rec.createdAt} |`,
    rec.summary ? `> ${rec.summary}` : '',
    sections[rec.type](rec.data),
    '---\n_Generado por SuckLess. PASS/FAIL proviene del ejecutor de pruebas. Una hipótesis no es un hecho hasta que una prueba ejecutada la reproduce; las correcciones son propuestas que una persona debe revisar._',
  ].filter(Boolean).join('\n\n') + '\n';
}
