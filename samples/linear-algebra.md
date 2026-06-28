# Linear Algebra Notes

A second document — open this alongside [welcome.md](welcome.md) to try multi-tab.

## Matrices

A matrix $A \in \mathbb{R}^{m \times n}$ acts on vectors by $y = Ax$.

$$
A = \begin{pmatrix} a_{11} & a_{12} \\ a_{21} & a_{22} \end{pmatrix}, \qquad
\det A = a_{11}a_{22} - a_{12}a_{21}
$$

## Eigenvalues

For a square matrix $A$, a scalar $\lambda$ is an eigenvalue if there is a nonzero
vector $v$ with

$$
A v = \lambda v.
$$

The characteristic polynomial is $p(\lambda) = \det(A - \lambda I)$.

## A longer section to test per-tab scrolling

Scroll down in this tab, switch to another tab, then come back — your scroll
position should be exactly where you left it.

- Vectors live in $\mathbb{R}^n$.
- The dot product is $\langle x, y \rangle = \sum_i x_i y_i$.
- The norm is $\|x\| = \sqrt{\langle x, x \rangle}$.
- Orthogonality: $x \perp y \iff \langle x, y \rangle = 0$.

$$
\| x + y \|^2 = \| x \|^2 + 2\langle x, y \rangle + \| y \|^2
$$
