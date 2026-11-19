# Maths with LaTeX

SketchBoard renders mathematical formulae written in **LaTeX** (with [KaTeX](https://katex.org)).
Formulae are drawn as sharp vector graphics. That holds on the board, in PNG / SVG export and when printing,
including black & white printing.

Every example on this page can be **copied and pasted straight onto the board** (`Ctrl+V`).

```latex
$$
x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$
```

---

## Contents

- [Quick start](#quick-start)
- [Ways to write a formula](#ways-to-write-a-formula)
- [Editing and styling](#editing-and-styling)
- [Cheat sheet](#cheat-sheet)
- [Copy-paste examples](#copy-paste-examples)
  - [Algebra](#algebra) · [Calculus](#calculus) · [Matrices & vectors](#matrices--vectors)
  - [Multi-line: cases & aligned steps](#multi-line-cases--aligned-steps)
  - [Probability & statistics](#probability--statistics)
  - [System design & capacity estimates](#system-design--capacity-estimates)
  - [Algorithms & computer science](#algorithms--computer-science)
  - [Machine learning](#machine-learning) · [Physics & chemistry](#physics--chemistry)
- [Colours, boxes, text and spacing](#colours-boxes-text-and-spacing)
- [Troubleshooting](#troubleshooting)

---

## Quick start

| You want to… | Do this |
|---|---|
| **Paste a formula** | Copy LaTeX from anywhere (a Markdown note, ChatGPT/Claude answer, paper, this page) and press **`Ctrl+V`** on the board. It appears where the pointer is. |
| **Write a new formula** | Press **`Alt+=`**, or click **⋯ (More tools) → Maths (LaTeX)**. Type in the editor that opens. The board updates as you type. |
| **Edit a formula** | **Double-click** it, or select it and click **Edit formula** in the side panel. |
| **Finish editing** | **`Ctrl+Enter`**, **`Esc`**, click **Done**, or click anywhere on the board. |
| **Resize** | Drag a corner handle: the whole formula scales. Or pick **S / M / L** or type a size in the side panel. |
| **Recolour** | Pick a **Colour** in the side panel. Parts with their own `\color{…}` keep it. |

The editor has buttons for the most common pieces: fraction, root, power, subscript, growing brackets, sum,
integral, limit, matrix and a few symbols. If text is selected, the button wraps it. For example, select `a+b`
and click **a/b** to get `\frac{a+b}{}`.

---

## Ways to write a formula

One formula element can hold **several equations**. Each block becomes one line, stacked top to bottom.
Text between the blocks is ignored. So you can paste a whole Markdown snippet and only the maths is kept.

| Write it as | Meaning |
|---|---|
| `$$ … $$` | One display equation (Markdown, MathJax, KaTeX, Obsidian, Notion, Jupyter). **Use this for several equations.** |
| `\[ … \]` | One display equation (LaTeX documents). |
| `\begin{equation} … \end{equation}` | One equation. `align`, `gather`, `multline` and matrix environments work too. |
| `$ … $` or `\( … \)` | A single inline formula: the whole paste must be this one formula. |
| Just the formula | e.g. `\frac{a}{b}`: without any `$` the whole text is one formula. |

Several equations in one element. Use **Line up equations** in the side panel to align them left, centre
or right:

```latex
$$
p = \left(1 - e^{-\frac{7 \times 50}{95.85}}\right)^7
$$

$$
m = -\frac{n \ln(p)}{(\ln 2)^2}
$$

$$
k = \frac{m}{n} \ln 2
$$
```

> **Tip:** pasted text is treated as maths only when it clearly is maths: `$$…$$` / `\[…\]` blocks,
> a maths environment, a whole `$…$`, or a short formula made of commands such as `\frac`, `\sqrt`, `\sum`.
> Ordinary text with dollar amounts (`costs $5 and $10`) still pastes as normal text.
> To be sure, wrap the formula in `$$ … $$`.

---

## Editing and styling

| Setting (side panel) | What it does |
|---|---|
| **Colour** | Colour of the whole formula (parts with `\color` keep their own). |
| **Formula size** | S (20 px), M (28 px), L (40 px), or any size from 6 to 400 px. Dragging a corner does the same. |
| **Line up equations** | Left / centre / right alignment of stacked equations. |
| **Opacity, rotation, layers, link, lock** | Same as for other elements. |

Formulae also work like other elements: you can move and duplicate them (`Ctrl+D`), group them (`Ctrl+G`),
add them to the library (`Shift+L`), undo (`Ctrl+Z`) and connect arrows to them.

**Exports**

| Output | Formula appears as |
|---|---|
| PNG, copy as PNG, print | Rendered maths (black in *Black & white*, greys in *Grayscale*). |
| SVG, copy as SVG | Rendered maths; the file loads KaTeX's fonts from the jsDelivr CDN when opened. |
| `.sketchboard` file | The formula (re-editable). |
| Excalidraw | Its LaTeX source as text (Excalidraw has no maths); it becomes a formula again when imported back into SketchBoard. |

---

## Cheat sheet

| Write | For | Write | For |
|---|---|---|---|
| `x^2`, `x^{10}` | power (use `{}` for more than one character) | `x_i`, `x_{i+1}` | subscript |
| `\frac{a}{b}` | fraction | `\sqrt{x}`, `\sqrt[3]{x}` | square / cube root |
| `\left( … \right)` | brackets that grow to fit | `\cdot`, `\times`, `\div` | · × ÷ |
| `\pm`, `\mp` | ± ∓ | `\le`, `\ge`, `\ne`, `\approx` | ≤ ≥ ≠ ≈ |
| `\sum_{i=1}^{n}` | sum | `\prod_{i=1}^{n}` | product |
| `\int_{a}^{b}` | integral | `\lim_{x \to 0}` | limit |
| `\infty` | ∞ | `\partial`, `\nabla` | ∂ ∇ |
| `\to`, `\Rightarrow`, `\iff` | → ⇒ ⇔ | `\in`, `\subseteq`, `\cup`, `\cap` | ∈ ⊆ ∪ ∩ |
| `\alpha \beta \pi \theta \lambda` | Greek (capitals: `\Delta \Sigma \Omega`) | `\ldots`, `\cdots` | … ⋯ |
| `\vec{v}`, `\hat{x}`, `\bar{x}` | accents | `\overline{AB}` | line over |
| `\text{words}` | normal text inside maths | `\mathbb{R}`, `\mathbf{x}` | ℝ, bold |
| `\log`, `\ln`, `\sin`, `\cos`, `\max` | upright function names | `\operatorname{softmax}` | your own function name |
| `\\` | new line (inside `aligned`, `cases`, matrices) | `&` | column / alignment point |
| `\,` `\;` `\quad` `\qquad` | small → large space | `\%`, `\$`, `\{ \}`, `\_` | literal % $ { } _ |

Full list of supported commands: <https://katex.org/docs/supported.html>

---

## Copy-paste examples

Each block below is ready to paste. Change the letters and numbers as you need.

### Algebra

```latex
$$
x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$
```

```latex
$$
(a+b)^2 = a^2 + 2ab + b^2
$$
```

```latex
$$
\sqrt{x} \quad \sqrt[3]{x} \quad \sqrt{\frac{a^2 + b^2}{2}}
$$
```

```latex
$$
a_{n} = a_1 + (n-1)d \qquad S_n = \frac{n}{2}\left(a_1 + a_n\right) \qquad \sum_{k=0}^{n-1} ar^k = a\,\frac{1-r^n}{1-r}
$$
```

```latex
$$
\log_b a = \frac{\ln a}{\ln b} \qquad \log(xy) = \log x + \log y \qquad e^{i\pi} + 1 = 0
$$
```

Brackets that grow to fit:

```latex
$$
\left( \frac{a}{b} \right) \quad \left[ \frac{a}{b} \right] \quad \left\{ \frac{a}{b} \right\} \quad \left| x \right| \quad \left\lVert v \right\rVert \quad \lfloor x \rfloor \quad \lceil x \rceil
$$
```

### Calculus

```latex
$$
\frac{d}{dx} x^n = n x^{n-1} \qquad \frac{\partial f}{\partial x} \qquad f'(x) \qquad \frac{d^2 y}{dx^2}
$$
```

```latex
$$
\int_0^\infty e^{-x^2} \, dx = \frac{\sqrt{\pi}}{2}
$$
```

```latex
$$
\int_a^b f(x) \, dx = F(b) - F(a) \qquad \iint_D f(x,y) \, dA \qquad \oint_C \vec{F} \cdot d\vec{r}
$$
```

```latex
$$
\lim_{x \to 0} \frac{\sin x}{x} = 1 \qquad \lim_{n \to \infty} \left(1 + \frac{1}{n}\right)^n = e
$$
```

```latex
$$
e^x = \sum_{n=0}^{\infty} \frac{x^n}{n!} = 1 + x + \frac{x^2}{2!} + \frac{x^3}{3!} + \cdots
$$
```

### Matrices & vectors

```latex
$$
A = \begin{pmatrix} a & b \\ c & d \end{pmatrix} \qquad \det(A) = \begin{vmatrix} a & b \\ c & d \end{vmatrix} = ad - bc
$$
```

```latex
$$
I_3 = \begin{bmatrix} 1 & 0 & 0 \\ 0 & 1 & 0 \\ 0 & 0 & 1 \end{bmatrix}
$$
```

```latex
$$
A = \begin{pmatrix} a_{11} & a_{12} & \cdots & a_{1n} \\ a_{21} & a_{22} & \cdots & a_{2n} \\ \vdots & \vdots & \ddots & \vdots \\ a_{m1} & a_{m2} & \cdots & a_{mn} \end{pmatrix}
$$
```

```latex
$$
\mathbf{y} = W\mathbf{x} + \mathbf{b} \qquad \vec{a} \cdot \vec{b} = \lVert \vec{a} \rVert \, \lVert \vec{b} \rVert \cos\theta \qquad A\mathbf{v} = \lambda \mathbf{v}
$$
```

Bracket styles: `pmatrix` ( ), `bmatrix` [ ], `Bmatrix` { }, `vmatrix` | |, `Vmatrix` ‖ ‖, `matrix` (none).

### Multi-line: cases & aligned steps

Use `\\` to start a new line and `&` to mark the point the lines line up on.

```latex
$$
|x| = \begin{cases} x & \text{if } x \ge 0 \\ -x & \text{otherwise} \end{cases}
$$
```

```latex
$$
\begin{aligned}
(a+b)^2 &= (a+b)(a+b) \\
        &= a^2 + ab + ba + b^2 \\
        &= a^2 + 2ab + b^2
\end{aligned}
$$
```

```latex
$$
\begin{aligned}
2x + 3y &= 7 \\
 x -  y &= 1
\end{aligned}
\qquad\Rightarrow\qquad
x = 2,\; y = 1
$$
```

```latex
$$
\begin{align}
E &= mc^2 \tag{1} \\
F &= ma   \tag{2}
\end{align}
$$
```

### Probability & statistics

```latex
$$
P(A \mid B) = \frac{P(B \mid A)\, P(A)}{P(B)}
$$
```

```latex
$$
\mu = \frac{1}{n} \sum_{i=1}^{n} x_i \qquad \sigma = \sqrt{\frac{1}{n} \sum_{i=1}^{n} (x_i - \mu)^2}
$$
```

```latex
$$
f(x) = \frac{1}{\sigma\sqrt{2\pi}} \, e^{-\frac{(x-\mu)^2}{2\sigma^2}}
$$
```

```latex
$$
\binom{n}{k} = \frac{n!}{k!\,(n-k)!} \qquad P(X = k) = \binom{n}{k} p^k (1-p)^{n-k}
$$
```

```latex
$$
\mathbb{E}[X] = \sum_x x \, P(X = x) \qquad \operatorname{Var}(X) = \mathbb{E}[X^2] - \mathbb{E}[X]^2
$$
```

```latex
$$
P(\text{at least one collision}) \approx 1 - e^{-\frac{n^2}{2N}}
$$
```

### System design & capacity estimates

Bloom filter: false-positive rate, bits needed, best number of hash functions:

```latex
$$
p = \left(1 - e^{-\frac{k n}{m}}\right)^k
$$

$$
m = -\frac{n \ln(p)}{(\ln 2)^2}
$$

$$
k = \frac{m}{n} \ln 2
$$
```

Traffic and storage estimates:

```latex
$$
\text{QPS} = \frac{\text{DAU} \times \text{requests per user per day}}{86\,400} \qquad \text{Peak QPS} \approx 2 \times \text{QPS}
$$
```

```latex
$$
\text{Storage} = \text{users} \times \text{items per day} \times \text{item size} \times 365 \times \text{years}
$$
```

```latex
$$
\text{Bandwidth} = \text{QPS} \times \text{average response size}
$$
```

Availability:

```latex
$$
A = \frac{\text{MTBF}}{\text{MTBF} + \text{MTTR}} \qquad A_{\text{serial}} = \prod_{i} A_i \qquad A_{\text{parallel}} = 1 - \prod_{i} \left(1 - A_i\right)
$$
```

```latex
$$
99.99\% \;\Rightarrow\; 0.0001 \times 365 \times 24 \times 60 \approx 52.6 \text{ minutes of downtime per year}
$$
```

Queues, quorums, hashing and scaling:

```latex
$$
L = \lambda W \qquad \text{(Little's law: items in system = arrival rate} \times \text{time in system)}
$$
```

```latex
$$
W + R > N \;\Rightarrow\; \text{every read overlaps the latest write}
$$
```

```latex
$$
\text{node}(k) = \min \{\, n \in \text{ring} : h(n) \ge h(k) \,\} \qquad \text{keys moved} \approx \frac{K}{N}
$$
```

```latex
$$
S(N) = \frac{1}{(1 - P) + \frac{P}{N}} \qquad \text{(Amdahl's law)}
$$
```

```latex
$$
\text{shard} = \operatorname{hash}(\text{key}) \bmod N
$$
```

### Algorithms & computer science

```latex
$$
T(n) = 2\,T\!\left(\frac{n}{2}\right) + O(n) \;\Rightarrow\; T(n) = O(n \log n)
$$
```

```latex
$$
O(1) < O(\log n) < O(n) < O(n \log n) < O(n^2) < O(2^n) < O(n!)
$$
```

```latex
$$
\forall x \, \exists y : x < y \qquad p \land q \qquad p \lor q \qquad \neg p \qquad p \Rightarrow q \qquad p \iff q
$$
```

```latex
$$
A \cup B \quad A \cap B \quad A \setminus B \quad x \in A \quad A \subseteq B \quad \emptyset \quad \mathbb{N} \subset \mathbb{Z} \subset \mathbb{Q} \subset \mathbb{R}
$$
```

```latex
$$
a \equiv b \pmod{n} \qquad \gcd(a, b) = \gcd(b, a \bmod b)
$$
```

### Machine learning

```latex
$$
\operatorname{softmax}(z)_i = \frac{e^{z_i}}{\sum_{j=1}^{K} e^{z_j}}
$$
```

```latex
$$
\mathcal{L} = -\frac{1}{N} \sum_{i=1}^{N} \left[ y_i \log \hat{y}_i + (1 - y_i) \log (1 - \hat{y}_i) \right]
$$
```

```latex
$$
\theta \leftarrow \theta - \eta \, \nabla_\theta \mathcal{L}(\theta)
$$
```

```latex
$$
\operatorname{Attention}(Q, K, V) = \operatorname{softmax}\!\left(\frac{QK^\top}{\sqrt{d_k}}\right) V
$$
```

```latex
$$
\hat{y} = \arg\max_{c} \; P(c \mid x) \qquad \text{precision} = \frac{TP}{TP + FP} \qquad \text{recall} = \frac{TP}{TP + FN}
$$
```

### Physics & chemistry

```latex
$$
F = G\frac{m_1 m_2}{r^2} \qquad E = h\nu \qquad E = mc^2
$$
```

```latex
$$
\nabla \cdot \vec{E} = \frac{\rho}{\varepsilon_0} \qquad \nabla \times \vec{B} = \mu_0 \vec{J} + \mu_0 \varepsilon_0 \frac{\partial \vec{E}}{\partial t}
$$
```

```latex
$$
\mathrm{2H_2 + O_2 \rightarrow 2H_2O} \qquad \mathrm{CH_4 + 2O_2 \longrightarrow CO_2 + 2H_2O}
$$
```

---

## Colours, boxes, text and spacing

```latex
$$
\color{red}{x^2} + \color{blue}{y^2} = r^2
$$
```

```latex
$$
a + \textcolor{#e03131}{b} + c \qquad \colorbox{yellow}{$x = 1$}
$$
```

`\color{red}` changes the colour of **everything after it** (in its group). Use `\textcolor{red}{…}` to colour
just one part.

```latex
$$
\boxed{E = mc^2} \qquad \overbrace{a + b + c}^{\text{3 terms}} \qquad \underbrace{x + y}_{\text{sum}}
$$
```

```latex
$$
\text{speed} = \frac{\text{distance}}{\text{time}} \qquad \mathbf{bold} \quad \mathit{italic} \quad \mathrm{upright} \quad \mathbb{R} \quad \mathcal{O} \quad \mathtt{mono}
$$
```

Spacing, from smallest to largest (`\!` pulls things closer):

```latex
$$
a\!b \quad a b \quad a\,b \quad a\;b \quad a\ b \quad a\quad b \quad a\qquad b
$$
```

Arrows and accents:

```latex
$$
\to \quad \leftarrow \quad \Rightarrow \quad \Leftrightarrow \quad \mapsto \quad \xrightarrow{f} \quad \xleftarrow[\text{under}]{\text{over}} \qquad \hat{x} \quad \bar{x} \quad \vec{v} \quad \tilde{x} \quad \dot{x} \quad \ddot{x}
$$
```

Greek letters:

```latex
$$
\alpha \ \beta \ \gamma \ \delta \ \epsilon \ \varepsilon \ \zeta \ \eta \ \theta \ \iota \ \kappa \ \lambda \ \mu \ \nu \ \xi \ \pi \ \rho \ \sigma \ \tau \ \upsilon \ \phi \ \varphi \ \chi \ \psi \ \omega
$$

$$
\Gamma \ \Delta \ \Theta \ \Lambda \ \Xi \ \Pi \ \Sigma \ \Upsilon \ \Phi \ \Psi \ \Omega
$$
```

Your own shortcuts with `\newcommand`, defined at the start of the formula:

```latex
$$
\newcommand{\vecspace}{\mathbb{R}^n}
\newcommand{\norm}[1]{\left\lVert #1 \right\rVert}
f : \vecspace \to \mathbb{R} \qquad \norm{x + y} \le \norm{x} + \norm{y}
$$
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Part of the formula shows in **red** | That part isn't valid LaTeX. The editor shows KaTeX's message under the box, e.g. *Expected '}'*. Usually a missing `}` or a misspelt command. |
| Pasted LaTeX became plain text | It didn't clearly look like maths. Wrap it in `$$ … $$` and paste again, or press `Alt+=` and paste into the editor. |
| `x^10` shows as x¹0 | Put more than one character in braces: `x^{10}`, `x_{ij}`. |
| Brackets are too small around a fraction | Use `\left( … \right)` instead of `( … )`. |
| Words run together / show in italics | Wrap words in `\text{…}`: `\text{if } x > 0`. |
| `%`, `$`, `#`, `&`, `_`, `{`, `}` disappear or cause errors | Escape them: `\%`, `\$`, `\#`, `\&`, `\_`, `\{`, `\}`. |
| `\begin{equation}` numbering is missing | KaTeX doesn't number equations automatically. Add `\tag{1}` yourself. |
| `\usepackage`, `\documentclass`, `\label` / `\ref`, TikZ | Not supported: only the maths part of LaTeX works. Paste just the formula. |
| The formula shows its LaTeX source in grey | The maths renderer is still loading (first use). It appears within a moment. |

KaTeX's full list of supported commands: <https://katex.org/docs/supported.html>.
How the rendering works inside SketchBoard is described in
[ARCHITECTURE.md](ARCHITECTURE.md#maths-latex).
