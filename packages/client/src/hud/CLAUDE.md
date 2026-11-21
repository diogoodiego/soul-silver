# HUD

## Componentes

- Não sobrescreva o estilo de um componente (`Button`, `Glyph`, `HpBar` e os demais de `src/ui/`) passando classes
  de estilo para ele. Errado: `<Button variant="primary" class="flex gap-1.5 shadow-[...]">`.
- Use o componente como ele é, com as props e variantes que ele já tem.
- Posição e layout ficam num elemento seu em volta do componente (uma `div` absoluta, um grid).
- Se faltar um visual ou comportamento, pergunte ou proponha uma prop ou variante no próprio componente.

## Tipografia

- Não use tamanhos de texto customizados (`text-[0.8em]`, `text-[0.75rem]`, `text-[11px]`).
- Use só a escala do Tailwind: `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl` e assim por diante.
