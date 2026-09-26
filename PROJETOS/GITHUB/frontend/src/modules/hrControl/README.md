# HR Control — modularização

## Objetivo

O módulo `hrControl` foi reorganizado para separar apresentação, orquestração, regras de domínio e componentes visuais.

### Estrutura

```text
hrControl/
├── pages/
│   └── HrControl.tsx              # Entry point fino da página
├── components/
│   ├── HrControlView.tsx          # Composição da tela / JSX
│   └── hrControlCharts.tsx        # Gráficos e controles visuais reutilizáveis
├── domain/
│   └── hrControlModel.ts          # Tipos, constantes e regras puras do domínio
├── hooks/
│   └── useHrControl.ts            # Orquestração de estado, efeitos e consultas
└── utils/
    ├── absenteeismStreak.ts
    ├── employeeCardScope.ts
    ├── employeeKindSelection.test.mjs
    ├── hrPointCache.ts
    ├── hrSessionCache.ts
    ├── monthComparison.ts
    ├── pointCacheIndex.ts
    └── rollingMonths.ts
```

## Responsabilidades

- **`pages/HrControl.tsx`**: ponto de entrada; não contém regra de negócio nem JSX complexo.
- **`components/HrControlView.tsx`**: camada de apresentação. Recebe o controller como contrato e apenas compõe a interface.
- **`components/hrControlCharts.tsx`**: gráficos, calendário e componentes de configuração visual.
- **`domain/hrControlModel.ts`**: regras determinísticas, normalização, classificação, filtros, cálculos de datas, métricas e configurações padrão.
- **`hooks/useHrControl.ts`**: camada de aplicação/orquestração. Centraliza estado React, efeitos, carregamento de dados e composição das regras do domínio.
- **`utils/`**: infraestrutura especializada já existente para cache, comparação mensal, streak de absenteísmo e escopo de funcionários.

## Princípios aplicados

1. **Separation of Concerns** — UI, domínio e orquestração não ficam no mesmo arquivo.
2. **Single Responsibility** — cada módulo tem uma responsabilidade explícita.
3. **Pure Functions** — cálculos e transformações que não precisam de React foram removidos do componente.
4. **Dependency Direction** — a página depende da view; a view depende do contrato do controller e do domínio; regras de domínio não dependem de componentes de UI.
5. **Testabilidade** — funções puras continuam isoladas e podem ser testadas sem montar a tela.
6. **Baixo acoplamento visual** — os gráficos não conhecem a implementação do controller.
7. **Controller Contract** — `HrControlController` é derivado de `ReturnType<typeof useHrControl>`, evitando duplicação manual de uma interface gigantesca.

## Fluxo

```text
HrControl page
    ↓
useHrControl()
    ↓
HrControlController
    ↓
HrControlView
    ├── charts
    └── controles de UI

useHrControl()
    ├── hooks React / Firebase
    ├── domain/hrControlModel
    └── utils especializados
```

A refatoração preserva as regras existentes; o objetivo foi mudar a organização e as fronteiras de responsabilidade, não alterar o comportamento funcional.
