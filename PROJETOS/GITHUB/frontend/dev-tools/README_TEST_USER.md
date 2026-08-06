Teste rápido: criar usuário 'view-only' no localStorage

1) Objetivo
- Simular um usuário com permissão apenas de `view` para testar que ele não consegue criar/editar/excluir.

2) Instruções
- Inicie o frontend (veja comandos abaixo).
- No navegador, abra a aplicação, abra o DevTools → Console e cole o snippet `SET_TEST_USER_SNIPPET` abaixo.
- Recarregue a página. O usuário de teste será usado pelo `AuthProvider` via `localStorage`.

3) Snippet (cole no Console e execute)

```javascript
// Ajuste o campo `screen` em permissions[0].screen para a tela que deseja testar, ex: "employees".
(function createViewOnlyTestUser(){
  const user = {
    id: "test-view-user",
    username: "TESTUSR",
    name: "Teste View",
    role: "Usuario",
    initials: "TV",
    employeeId: null,
    isAdmin: false,
    permissions: [
      {
        id: "test-view-user-employees",
        userId: "test-view-user",
        screen: "employees",
        actions: ["view"],
        updatedAt: new Date().toISOString(),
      },
    ],
  };

  window.localStorage.setItem("macro-dp:user", JSON.stringify(user));
  console.info("Usuário de teste 'view-only' criado em localStorage (macro-dp:user).");
  // Recarregue a página manualmente ou descomente a linha abaixo para forçar reload.
  // location.reload();
})();
```

4) Remover usuário de teste

```javascript
window.localStorage.removeItem("macro-dp:user");
location.reload();
```

5) Comandos para rodar o frontend localmente

```powershell
cd frontend
npm install   # se ainda não instalou
npm run dev
```

7) Script automatizado (Puppeteer)

- Instale o Puppeteer no diretório `frontend`:

```powershell
cd frontend
npm install puppeteer --save-dev
```

- Rodar o script que abre o navegador e injeta o usuário de teste:

```powershell
node frontend/dev-tools/inject-test-user.js --url http://localhost:5173 --path /app/employees --screen employees
```

- Parâmetros:
  - `--url`: URL base do app (padrão `http://localhost:5173`).
  - `--path`: rota a abrir após injetar (padrão `/`).
  - `--screen`: `AppScreen` que receberá apenas `view` (padrão `employees`).

Observação: o script utiliza Puppeteer para controlar o navegador; mantenha seu servidor do frontend rodando antes de executar.

6) Observações
- O snippet simula apenas o `User` no `localStorage`. Ele não cria documentos no Firestore. Para verificar a proteção do Firestore, use as regras e crie/edite documentos reais na coleção `systemPermissions` (somente em ambiente de teste).