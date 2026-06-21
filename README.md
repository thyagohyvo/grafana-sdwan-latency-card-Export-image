# SD-WAN Latência - Painel Grafana (HTML Graphics)

Painel customizado para o Grafana, construído com o plugin **HTML Graphics**. Renderiza a latência de um link SD-WAN a partir do Zabbix, com gauge de status, KPIs e exportação do card como imagem PNG. Tudo em Canvas puro, sem dependências externas.

<img width="1278" height="405" alt="image" src="https://github.com/user-attachments/assets/dbd9b63e-7133-4f9f-ad4c-23e8fea66498" />


## Funcionalidades

- Gráfico de área com curva suavizada (Catmull-Rom), gradiente e zona de alerta destacada acima do limiar configurado.
- Tooltip interativo ao passar o mouse sobre a curva, mostrando horário e valor do ponto mais próximo.
- Gauge circular com o valor atual em relação ao limiar.
- Badge de status dinâmico: `Normal` / `Atenção` / `Crítico`.
- KPIs do período: atual, média, máximo e mínimo.
- Botão de download que exporta o card inteiro (gauge + KPIs + gráfico) como PNG.
- Estado de "sem dados" quando o item do Zabbix não retorna valores.

## Estrutura

```
.
├── panel.css   # estilos do painel
├── panel.html  # markup renderizado dentro do htmlNode
└── panel.js    # extração de dados, desenho do gráfico, gauge e exportação PNG
```

## Pré-requisitos

- Grafana com o plugin **HTML Graphics** (ou equivalente que exponha `htmlNode` e `data` no contexto do script).
- Datasource Zabbix configurado, com uma query retornando:
  - `field[0]`: timestamp
  - `field[1]`: valor numérico (latência em ms)
 <img width="1392" height="780" alt="image" src="https://github.com/user-attachments/assets/cf437599-efce-47f2-b94a-fbcab51a8e83" />


## Instalação

1. No painel, defina o tipo de visualização como **HTML Graphics**.
2. Cole o conteúdo de `panel.css` no campo de CSS.
3. Cole o conteúdo de `panel.html` no campo de HTML.
4. Cole o conteúdo de `panel.js` no campo de JS.
5. Aponte a query do Zabbix para o host/item de latência desejado.

## Configuração

No topo de `panel.js`:

```js
const THRESHOLD = 55; // limiar de alerta, em ms
```

O gauge e o badge mudam de cor automaticamente conforme o valor atual:

| Status     | Condição                          |
|------------|------------------------------------|
| Normal     | abaixo de 85% do limiar            |
| Atenção    | entre 85% e 100% do limiar         |
| Crítico    | acima do limiar                    |

Título, subtítulo e nome da métrica podem ser ajustados na função `updateMeta()` (`panel.js`) e nos textos fixos do `panel.html`.

## Exportar como imagem

O botão no rodapé (canto direito) gera um PNG do card completo. No clique, o script relê a posição de cada bloco (header, gauge, KPIs, gráfico) e redesenha tudo num único canvas - sem usar bibliotecas como `html2canvas`.

O clique é disparado manualmente com `bubbles: false` para o evento não se propagar até o `document` e ser capturado pelo roteador interno do Grafana, o que causaria um redirecionamento indevido para "Page not found".

## Licença

Defina conforme a política do repositório (ex: MIT, uso interno).
