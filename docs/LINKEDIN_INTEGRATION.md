# Guia de Integração Oficial — LinkedIn Connect & Smart CV Builder

## 1. Registro da Aplicação no LinkedIn Developer Portal
1. Acesse o LinkedIn Developer Portal (`https://www.linkedin.com/developers/apps`) e clique em **Create app**.
2. Informe o nome da aplicação, vincule a uma LinkedIn Page oficial e faça upload do logotipo.
3. Na aba **Auth**, copie o **Client ID** e o **Client Secret** (nunca insira esses valores no código-fonte ou no frontend).

## 2. Redirect URIs e Escopos Autorizados
- Em **Authorized redirect URLs for your app**, cadastre exatamente:
  - Desenvolvimento: `http://localhost:5000/api/linkedin/oauth/callback`
  - Produção (HTTPS obrigatório): `https://seu-dominio.com/api/linkedin/oauth/callback`
- Na aba **Products**, solicite o produto **Sign In with LinkedIn using OpenID Connect**, que habilita os escopos mínimos padrão:
  - `openid`
  - `profile`
  - `email`

## 3. Variáveis de Ambiente
Copie `.env.example` para `.env` e preencha:
- `FLASK_SECRET_KEY`: chave de assinatura de sessão (`HttpOnly`, `SameSite=Lax`, `Secure` em HTTPS).
- `LINKEDIN_CLIENT_ID` e `LINKEDIN_CLIENT_SECRET`: credenciais OAuth 2.0 (mantidas exclusivamente no backend).
- `LINKEDIN_REDIRECT_URI` e `LINKEDIN_ALLOWED_REDIRECT_URIS`: lista estrita de URIs aceitas.
- `LINKEDIN_TOKEN_ENC_KEY`: chave mestra para criptografia autenticada em repouso (Encrypt-then-MAC).

## 4. Testando OAuth em Desenvolvimento e Produção
- **Desenvolvimento**: inicie o servidor Flask (`python app.py`) com as variáveis definidas e abra `http://localhost:5000`. Clique em **🔗 LinkedIn & CV Builder** -> **Conectar ao LinkedIn**.
- **Produção**: publique sempre atrás de TLS/HTTPS (ex.: Nginx/Cloudflare + `ProxyFix`), com `FLASK_DEBUG=false`.

## 5. Criptografia, Armazenamento e Rotação de Chaves
- Tokens são armazenados exclusivamente no backend em `security_logs/linkedin_cv.db` cifrados via `LinkedinTokenManager` (`Encrypt-then-MAC` com subchaves derivadas por HMAC-SHA256).
- O anel de chaves (`key_id`) suporta rotação sem invalidar tokens ativos via `LinkedinTokenManager.rotate_key()`.
- Tokens e códigos OAuth **nunca** são gravados em logs ou retornados ao navegador.

## 6. Tratamento de Erros de Autorização e Permissões Adicionais
- Se o usuário recusar consentimento (`error=access_denied`) ou o token expirar (`401`), o painel exibe o estado claro e oferece reconexão ou preenchimento manual/upload de PDF.
- Campos avançados (experiência, formação, competências) exigem aprovação de produtos restritos do **LinkedIn Partner Program** (`r_fullprofile`). Quando indisponíveis, o VagaPulse AI utiliza automaticamente o perfil manual/currículo PDF sem inventar dados.
