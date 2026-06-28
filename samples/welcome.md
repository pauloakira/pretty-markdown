# pretty-markdown

A markdown reader built for documents with **LaTeX math**.

## Inline math

The mass–energy equivalence $E = mc^2$ sits inline with the text, and so does a
fraction like $\tfrac{1}{2}$ or a sum $\sum_{i=1}^{n} i = \tfrac{n(n+1)}{2}$.

Currency such as $5 or $10 is **not** treated as math.

## Display math

The Gaussian integral:

$$
\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}
$$

Maxwell's equations in differential form:

$$
\nabla \cdot \mathbf{E} = \frac{\rho}{\varepsilon_0}, \qquad
\nabla \times \mathbf{B} = \mu_0 \mathbf{J} + \mu_0 \varepsilon_0 \frac{\partial \mathbf{E}}{\partial t}
$$

## Custom macros (`\gdef`)

Define a macro once and reuse it across the document:

$$
\gdef\norm#1{\left\lVert #1 \right\rVert}
\norm{x} = \sqrt{\langle x, x \rangle}
$$

Now it works inline too: $\norm{v} \le \norm{u} + \norm{w}$.

## MathJax fallback

Some constructs aren't supported by KaTeX and fall back to MathJax automatically, e.g.
`\enclose`: $\enclose{circle}{x}$ and $\enclose{updiagonalstrike}{abc}$.

> Tip: select a formula and copy it — the **LaTeX source** lands on your clipboard,
> not the rendered glyphs.

## Lists, code, quotes

1. First item
2. Second item with `inline code`

> A blockquote to check reading typography.

```python
def f(x):
    return x ** 2
```

| Symbol | Meaning |
|--------|---------|
| $\pi$  | ratio   |
| $\phi$ | golden  |
