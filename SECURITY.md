# Sécurité

AgentVegan Public Data est un service public, sans compte, sans OAuth et intégralement en lecture seule. Il ne doit jamais recevoir ni conserver de session commerçante, identifiant, cookie, jeton, profil, prompt complet ou donnée personnelle.

Pour signaler une vulnérabilité, écrivez en privé à `support@agentvegan.org` avec l’URL concernée, l’impact observé et des étapes de reproduction minimales. Ne joignez aucune donnée personnelle ou secret réel. Une réception est confirmée dès que possible, puis le correctif et sa publication sont suivis dans un canal privé jusqu’à résolution.

Les interfaces MCP Apps sont isolées par l’hôte, valident tout `structuredContent`, n’ouvrent que des URL HTTPS dont l’origine est explicitement autorisée et déclarent une CSP restrictive. Les images restent distantes : aucun octet d’image n’est copié dans le Worker, D1 ou ce dépôt.
