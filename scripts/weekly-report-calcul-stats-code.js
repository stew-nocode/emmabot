/**
 * Corps du nœud n8n « Calcul stats hebdo » (workflow Rapport hebdomadaire).
 * Déployé via update-weekly-report-template.mjs
 */
const rows = $input.all().map((i) => i.json);
const now = new Date();
const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

const recent = rows.filter((r) => {
  if (!r.createdAt) return false;
  return new Date(r.createdAt) >= sevenDaysAgo;
});

const total = recent.length;
const sansReponse = recent.filter(
  (r) =>
    r.reponse_chatbot &&
    (r.reponse_chatbot.includes("Je n'ai pas cette information") ||
      r.reponse_chatbot.includes("Je transmets")),
);
const nbSansReponse = sansReponse.length;
const tauxReponse = total > 0 ? Math.round(((total - nbSansReponse) / total) * 100) : 0;

const qCount = {};
recent.forEach((r) => {
  if (r.questions_posees) qCount[r.questions_posees] = (qCount[r.questions_posees] || 0) + 1;
});
const topQuestions = Object.entries(qCount)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5);

const uCount = {};
recent.forEach((r) => {
  if (r.user_id && r.user_id.trim()) uCount[r.user_id] = (uCount[r.user_id] || 0) + 1;
});
const topUsers = Object.entries(uCount)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5);

const sansReponseUniq = [...new Set(sansReponse.map((r) => r.questions_posees).filter(Boolean))].slice(
  0,
  10,
);

const dateRange = `${sevenDaysAgo.toLocaleDateString('fr-FR')} → ${now.toLocaleDateString('fr-FR')}`;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const topQHtml = topQuestions.length
  ? topQuestions
      .map(
        ([q, n]) =>
          `<tr><td style="padding:12px 0;border-bottom:1px solid #f1f5f9;color:#334155;font-size:14px;line-height:1.45;">${escapeHtml(q)}</td><td style="padding:12px 0;border-bottom:1px solid #f1f5f9;text-align:right;font-size:14px;font-variant-numeric:tabular-nums;color:#64748b;width:56px;">${n}×</td></tr>`,
      )
      .join('')
  : '<tr><td colspan="2" style="padding:20px 0;color:#94a3b8;font-size:14px;">Aucune donnée sur la période.</td></tr>';

const topUHtml = topUsers.length
  ? topUsers
      .map(
        ([u, n]) =>
          `<tr><td style="padding:12px 0;border-bottom:1px solid #f1f5f9;color:#334155;font-size:14px;">${escapeHtml(u)}</td><td style="padding:12px 0;border-bottom:1px solid #f1f5f9;text-align:right;font-size:14px;color:#64748b;">${n}</td></tr>`,
      )
      .join('')
  : '<tr><td colspan="2" style="padding:20px 0;color:#94a3b8;font-size:14px;">Aucun utilisateur identifié (userId non renseigné côté ERP).</td></tr>';

const sansRepHtml = sansReponseUniq.length
  ? `<ul style="margin:0;padding:0;list-style:none;">${sansReponseUniq
      .map(
        (q) =>
          `<li style="margin:0 0 12px 0;padding:12px 14px 12px 16px;background:#fffbeb;border-radius:8px;border-left:4px solid #f59e0b;color:#422006;font-size:14px;line-height:1.45;">${escapeHtml(q)}</li>`,
      )
      .join('')}</ul>`
  : '<p style="margin:0;font-size:14px;color:#047857;">Aucune question sans réponse KB sur cette période.</p>';

const avecKb = total - nbSansReponse;

const html = `<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background:#e2e8f0;">
<div style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:#e2e8f0;padding:28px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;">
<tr>
<td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);border-radius:14px 14px 0 0;padding:32px 28px;">
<p style="margin:0 0 8px 0;font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#94a3b8;">Période analysée</p>
<h1 style="margin:0;font-size:24px;font-weight:700;color:#f8fafc;line-height:1.25;letter-spacing:-0.02em;">Rapport hebdomadaire</h1>
<p style="margin:8px 0 0 0;font-size:17px;font-weight:600;color:#38bdf8;letter-spacing:-0.01em;">Assistant IA</p>
<p style="margin:16px 0 0 0;font-size:14px;color:#cbd5e1;">${escapeHtml(dateRange)}</p>
</td>
</tr>
<tr>
<td style="background:#ffffff;padding:28px 28px 8px 28px;border-left:1px solid #cbd5e1;border-right:1px solid #cbd5e1;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:8px;">
<tr>
<td width="33.33%" style="padding:6px;vertical-align:top;">
<div style="background:#f8fafc;border-radius:12px;padding:18px 12px;text-align:center;border:1px solid #e2e8f0;">
<div style="font-size:26px;font-weight:700;color:#0f172a;line-height:1;">${total}</div>
<div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-top:8px;">Total</div>
</div>
</td>
<td width="33.33%" style="padding:6px;vertical-align:top;">
<div style="background:#ecfdf5;border-radius:12px;padding:18px 12px;text-align:center;border:1px solid #a7f3d0;">
<div style="font-size:26px;font-weight:700;color:#047857;line-height:1;">${avecKb}</div>
<div style="font-size:11px;font-weight:600;color:#059669;text-transform:uppercase;letter-spacing:0.08em;margin-top:8px;">Réponse KB</div>
<div style="font-size:13px;color:#10b981;margin-top:4px;">${tauxReponse} %</div>
</div>
</td>
<td width="33.33%" style="padding:6px;vertical-align:top;">
<div style="background:#fff7ed;border-radius:12px;padding:18px 12px;text-align:center;border:1px solid #fed7aa;">
<div style="font-size:26px;font-weight:700;color:#c2410c;line-height:1;">${nbSansReponse}</div>
<div style="font-size:11px;font-weight:600;color:#9a3412;text-transform:uppercase;letter-spacing:0.08em;margin-top:8px;">Sans KB</div>
</div>
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="background:#ffffff;padding:8px 28px 24px 28px;border-left:1px solid #cbd5e1;border-right:1px solid #cbd5e1;">
<p style="margin:0 0 14px 0;font-size:13px;font-weight:600;color:#0f172a;text-transform:uppercase;letter-spacing:0.1em;">Questions les plus fréquentes</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">${topQHtml}</table>
</td>
</tr>
<tr>
<td style="background:#ffffff;padding:8px 28px 24px 28px;border-left:1px solid #cbd5e1;border-right:1px solid #cbd5e1;">
<p style="margin:0 0 14px 0;font-size:13px;font-weight:600;color:#0f172a;text-transform:uppercase;letter-spacing:0.1em;">Utilisateurs les plus actifs</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">${topUHtml}</table>
</td>
</tr>
<tr>
<td style="background:#ffffff;padding:8px 28px 32px 28px;border-left:1px solid #cbd5e1;border-right:1px solid #cbd5e1;border-radius:0 0 14px 14px;border-bottom:1px solid #cbd5e1;">
<p style="margin:0 0 14px 0;font-size:13px;font-weight:600;color:#0f172a;text-transform:uppercase;letter-spacing:0.1em;">À documenter dans la base</p>
${sansRepHtml}
</td>
</tr>
<tr>
<td style="padding:22px 16px;text-align:center;">
<p style="margin:0;font-size:12px;color:#64748b;line-height:1.5;">Enrichir la base de connaissance à partir de ces questions améliore le taux de réponse de l’assistant.</p>
</td>
</tr>
</table>
</div>
</body>
</html>`;

return [{ json: { html, dateRange, total, nbSansReponse, tauxReponse } }];
