/**
 * Ready-to-use LaTeX examples shown in the in-app maths guide. Generated from docs/LATEX.md and kept
 * identical to it (a test checks every example appears there): edit both together.
 */
export interface MathExample {
  title: string;
  /** Exactly what is copied: one or more "$$ … $$" blocks. */
  source: string;
}

export interface MathExampleGroup {
  category: string;
  items: MathExample[];
}

export const MATH_EXAMPLES: MathExampleGroup[] = [
  {
    category: "Several equations",
    items: [
      { title: "Several equations (Bloom filter)", source: String.raw`$$
p = \left(1 - e^{-\frac{7 \times 50}{95.85}}\right)^7
$$

$$
m = -\frac{n \ln(p)}{(\ln 2)^2}
$$

$$
k = \frac{m}{n} \ln 2
$$` },
    ],
  },
  {
    category: "Algebra",
    items: [
      { title: "Quadratic formula", source: String.raw`$$
x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$` },
      { title: "Square of a sum", source: String.raw`$$
(a+b)^2 = a^2 + 2ab + b^2
$$` },
      { title: "Roots", source: String.raw`$$
\sqrt{x} \quad \sqrt[3]{x} \quad \sqrt{\frac{a^2 + b^2}{2}}
$$` },
      { title: "Sequences & series", source: String.raw`$$
a_{n} = a_1 + (n-1)d \qquad S_n = \frac{n}{2}\left(a_1 + a_n\right) \qquad \sum_{k=0}^{n-1} ar^k = a\,\frac{1-r^n}{1-r}
$$` },
      { title: "Logarithms & Euler", source: String.raw`$$
\log_b a = \frac{\ln a}{\ln b} \qquad \log(xy) = \log x + \log y \qquad e^{i\pi} + 1 = 0
$$` },
      { title: "Brackets that grow to fit", source: String.raw`$$
\left( \frac{a}{b} \right) \quad \left[ \frac{a}{b} \right] \quad \left\{ \frac{a}{b} \right\} \quad \left| x \right| \quad \left\lVert v \right\rVert \quad \lfloor x \rfloor \quad \lceil x \rceil
$$` },
    ],
  },
  {
    category: "Calculus",
    items: [
      { title: "Derivatives", source: String.raw`$$
\frac{d}{dx} x^n = n x^{n-1} \qquad \frac{\partial f}{\partial x} \qquad f'(x) \qquad \frac{d^2 y}{dx^2}
$$` },
      { title: "Gaussian integral", source: String.raw`$$
\int_0^\infty e^{-x^2} \, dx = \frac{\sqrt{\pi}}{2}
$$` },
      { title: "Integrals", source: String.raw`$$
\int_a^b f(x) \, dx = F(b) - F(a) \qquad \iint_D f(x,y) \, dA \qquad \oint_C \vec{F} \cdot d\vec{r}
$$` },
      { title: "Limits", source: String.raw`$$
\lim_{x \to 0} \frac{\sin x}{x} = 1 \qquad \lim_{n \to \infty} \left(1 + \frac{1}{n}\right)^n = e
$$` },
      { title: "Taylor series", source: String.raw`$$
e^x = \sum_{n=0}^{\infty} \frac{x^n}{n!} = 1 + x + \frac{x^2}{2!} + \frac{x^3}{3!} + \cdots
$$` },
    ],
  },
  {
    category: "Matrices & vectors",
    items: [
      { title: "2×2 matrix & determinant", source: String.raw`$$
A = \begin{pmatrix} a & b \\ c & d \end{pmatrix} \qquad \det(A) = \begin{vmatrix} a & b \\ c & d \end{vmatrix} = ad - bc
$$` },
      { title: "Identity matrix", source: String.raw`$$
I_3 = \begin{bmatrix} 1 & 0 & 0 \\ 0 & 1 & 0 \\ 0 & 0 & 1 \end{bmatrix}
$$` },
      { title: "General m×n matrix", source: String.raw`$$
A = \begin{pmatrix} a_{11} & a_{12} & \cdots & a_{1n} \\ a_{21} & a_{22} & \cdots & a_{2n} \\ \vdots & \vdots & \ddots & \vdots \\ a_{m1} & a_{m2} & \cdots & a_{mn} \end{pmatrix}
$$` },
      { title: "Vectors & eigenvalues", source: String.raw`$$
\mathbf{y} = W\mathbf{x} + \mathbf{b} \qquad \vec{a} \cdot \vec{b} = \lVert \vec{a} \rVert \, \lVert \vec{b} \rVert \cos\theta \qquad A\mathbf{v} = \lambda \mathbf{v}
$$` },
    ],
  },
  {
    category: "Multi-line: cases & aligned steps",
    items: [
      { title: "Piecewise (cases)", source: String.raw`$$
|x| = \begin{cases} x & \text{if } x \ge 0 \\ -x & \text{otherwise} \end{cases}
$$` },
      { title: "Step-by-step working (aligned)", source: String.raw`$$
\begin{aligned}
(a+b)^2 &= (a+b)(a+b) \\
        &= a^2 + ab + ba + b^2 \\
        &= a^2 + 2ab + b^2
\end{aligned}
$$` },
      { title: "System of equations", source: String.raw`$$
\begin{aligned}
2x + 3y &= 7 \\
 x -  y &= 1
\end{aligned}
\qquad\Rightarrow\qquad
x = 2,\; y = 1
$$` },
      { title: "Numbered equations", source: String.raw`$$
\begin{align}
E &= mc^2 \tag{1} \\
F &= ma   \tag{2}
\end{align}
$$` },
    ],
  },
  {
    category: "Probability & statistics",
    items: [
      { title: "Bayes' theorem", source: String.raw`$$
P(A \mid B) = \frac{P(B \mid A)\, P(A)}{P(B)}
$$` },
      { title: "Mean & standard deviation", source: String.raw`$$
\mu = \frac{1}{n} \sum_{i=1}^{n} x_i \qquad \sigma = \sqrt{\frac{1}{n} \sum_{i=1}^{n} (x_i - \mu)^2}
$$` },
      { title: "Normal distribution", source: String.raw`$$
f(x) = \frac{1}{\sigma\sqrt{2\pi}} \, e^{-\frac{(x-\mu)^2}{2\sigma^2}}
$$` },
      { title: "Binomial", source: String.raw`$$
\binom{n}{k} = \frac{n!}{k!\,(n-k)!} \qquad P(X = k) = \binom{n}{k} p^k (1-p)^{n-k}
$$` },
      { title: "Expectation & variance", source: String.raw`$$
\mathbb{E}[X] = \sum_x x \, P(X = x) \qquad \operatorname{Var}(X) = \mathbb{E}[X^2] - \mathbb{E}[X]^2
$$` },
      { title: "Birthday bound (collisions)", source: String.raw`$$
P(\text{at least one collision}) \approx 1 - e^{-\frac{n^2}{2N}}
$$` },
    ],
  },
  {
    category: "System design & capacity estimates",
    items: [
      { title: "Bloom filter", source: String.raw`$$
p = \left(1 - e^{-\frac{k n}{m}}\right)^k
$$

$$
m = -\frac{n \ln(p)}{(\ln 2)^2}
$$

$$
k = \frac{m}{n} \ln 2
$$` },
      { title: "QPS estimate", source: String.raw`$$
\text{QPS} = \frac{\text{DAU} \times \text{requests per user per day}}{86\,400} \qquad \text{Peak QPS} \approx 2 \times \text{QPS}
$$` },
      { title: "Storage estimate", source: String.raw`$$
\text{Storage} = \text{users} \times \text{items per day} \times \text{item size} \times 365 \times \text{years}
$$` },
      { title: "Bandwidth", source: String.raw`$$
\text{Bandwidth} = \text{QPS} \times \text{average response size}
$$` },
      { title: "Availability (serial / parallel)", source: String.raw`$$
A = \frac{\text{MTBF}}{\text{MTBF} + \text{MTTR}} \qquad A_{\text{serial}} = \prod_{i} A_i \qquad A_{\text{parallel}} = 1 - \prod_{i} \left(1 - A_i\right)
$$` },
      { title: "Downtime per year", source: String.raw`$$
99.99\% \;\Rightarrow\; 0.0001 \times 365 \times 24 \times 60 \approx 52.6 \text{ minutes of downtime per year}
$$` },
      { title: "Little's law", source: String.raw`$$
L = \lambda W \qquad \text{(Little's law: items in system = arrival rate} \times \text{time in system)}
$$` },
      { title: "Quorum (W + R > N)", source: String.raw`$$
W + R > N \;\Rightarrow\; \text{every read overlaps the latest write}
$$` },
      { title: "Consistent hashing", source: String.raw`$$
\text{node}(k) = \min \{\, n \in \text{ring} : h(n) \ge h(k) \,\} \qquad \text{keys moved} \approx \frac{K}{N}
$$` },
      { title: "Amdahl's law", source: String.raw`$$
S(N) = \frac{1}{(1 - P) + \frac{P}{N}} \qquad \text{(Amdahl's law)}
$$` },
      { title: "Hash sharding", source: String.raw`$$
\text{shard} = \operatorname{hash}(\text{key}) \bmod N
$$` },
    ],
  },
  {
    category: "Algorithms & computer science",
    items: [
      { title: "Recurrence (merge sort)", source: String.raw`$$
T(n) = 2\,T\!\left(\frac{n}{2}\right) + O(n) \;\Rightarrow\; T(n) = O(n \log n)
$$` },
      { title: "Big-O growth", source: String.raw`$$
O(1) < O(\log n) < O(n) < O(n \log n) < O(n^2) < O(2^n) < O(n!)
$$` },
      { title: "Logic", source: String.raw`$$
\forall x \, \exists y : x < y \qquad p \land q \qquad p \lor q \qquad \neg p \qquad p \Rightarrow q \qquad p \iff q
$$` },
      { title: "Sets", source: String.raw`$$
A \cup B \quad A \cap B \quad A \setminus B \quad x \in A \quad A \subseteq B \quad \emptyset \quad \mathbb{N} \subset \mathbb{Z} \subset \mathbb{Q} \subset \mathbb{R}
$$` },
      { title: "Modular arithmetic & gcd", source: String.raw`$$
a \equiv b \pmod{n} \qquad \gcd(a, b) = \gcd(b, a \bmod b)
$$` },
    ],
  },
  {
    category: "Machine learning",
    items: [
      { title: "Softmax", source: String.raw`$$
\operatorname{softmax}(z)_i = \frac{e^{z_i}}{\sum_{j=1}^{K} e^{z_j}}
$$` },
      { title: "Cross-entropy loss", source: String.raw`$$
\mathcal{L} = -\frac{1}{N} \sum_{i=1}^{N} \left[ y_i \log \hat{y}_i + (1 - y_i) \log (1 - \hat{y}_i) \right]
$$` },
      { title: "Gradient descent", source: String.raw`$$
\theta \leftarrow \theta - \eta \, \nabla_\theta \mathcal{L}(\theta)
$$` },
      { title: "Attention", source: String.raw`$$
\operatorname{Attention}(Q, K, V) = \operatorname{softmax}\!\left(\frac{QK^\top}{\sqrt{d_k}}\right) V
$$` },
      { title: "Argmax, precision & recall", source: String.raw`$$
\hat{y} = \arg\max_{c} \; P(c \mid x) \qquad \text{precision} = \frac{TP}{TP + FP} \qquad \text{recall} = \frac{TP}{TP + FN}
$$` },
    ],
  },
  {
    category: "Physics & chemistry",
    items: [
      { title: "Gravity & energy", source: String.raw`$$
F = G\frac{m_1 m_2}{r^2} \qquad E = h\nu \qquad E = mc^2
$$` },
      { title: "Maxwell's equations", source: String.raw`$$
\nabla \cdot \vec{E} = \frac{\rho}{\varepsilon_0} \qquad \nabla \times \vec{B} = \mu_0 \vec{J} + \mu_0 \varepsilon_0 \frac{\partial \vec{E}}{\partial t}
$$` },
      { title: "Chemical equations", source: String.raw`$$
\mathrm{2H_2 + O_2 \rightarrow 2H_2O} \qquad \mathrm{CH_4 + 2O_2 \longrightarrow CO_2 + 2H_2O}
$$` },
    ],
  },
  {
    category: "Colours, boxes, text and spacing",
    items: [
      { title: "Colours", source: String.raw`$$
\color{red}{x^2} + \color{blue}{y^2} = r^2
$$` },
      { title: "Colour one part / highlight", source: String.raw`$$
a + \textcolor{#e03131}{b} + c \qquad \colorbox{yellow}{$x = 1$}
$$` },
      { title: "Box, over- & underbrace", source: String.raw`$$
\boxed{E = mc^2} \qquad \overbrace{a + b + c}^{\text{3 terms}} \qquad \underbrace{x + y}_{\text{sum}}
$$` },
      { title: "Words & fonts", source: String.raw`$$
\text{speed} = \frac{\text{distance}}{\text{time}} \qquad \mathbf{bold} \quad \mathit{italic} \quad \mathrm{upright} \quad \mathbb{R} \quad \mathcal{O} \quad \mathtt{mono}
$$` },
      { title: "Spacing", source: String.raw`$$
a\!b \quad a b \quad a\,b \quad a\;b \quad a\ b \quad a\quad b \quad a\qquad b
$$` },
      { title: "Arrows & accents", source: String.raw`$$
\to \quad \leftarrow \quad \Rightarrow \quad \Leftrightarrow \quad \mapsto \quad \xrightarrow{f} \quad \xleftarrow[\text{under}]{\text{over}} \qquad \hat{x} \quad \bar{x} \quad \vec{v} \quad \tilde{x} \quad \dot{x} \quad \ddot{x}
$$` },
      { title: "Greek letters", source: String.raw`$$
\alpha \ \beta \ \gamma \ \delta \ \epsilon \ \varepsilon \ \zeta \ \eta \ \theta \ \iota \ \kappa \ \lambda \ \mu \ \nu \ \xi \ \pi \ \rho \ \sigma \ \tau \ \upsilon \ \phi \ \varphi \ \chi \ \psi \ \omega
$$

$$
\Gamma \ \Delta \ \Theta \ \Lambda \ \Xi \ \Pi \ \Sigma \ \Upsilon \ \Phi \ \Psi \ \Omega
$$` },
      { title: "Your own commands (\\newcommand)", source: String.raw`$$
\newcommand{\vecspace}{\mathbb{R}^n}
\newcommand{\norm}[1]{\left\lVert #1 \right\rVert}
f : \vecspace \to \mathbb{R} \qquad \norm{x + y} \le \norm{x} + \norm{y}
$$` },
    ],
  },
];

/** The cheat sheet from docs/LATEX.md: each command can be copied on its own. */
export const MATH_CHEATSHEET: Array<{ codes: string[]; meaning: string }> = [
  { codes: [String.raw`x^2`, String.raw`x^{10}`], meaning: "power (use {} for more than one character)" },
  { codes: [String.raw`x_i`, String.raw`x_{i+1}`], meaning: "subscript" },
  { codes: [String.raw`\frac{a}{b}`], meaning: "fraction" },
  { codes: [String.raw`\sqrt{x}`, String.raw`\sqrt[3]{x}`], meaning: "square / cube root" },
  { codes: [String.raw`\left( … \right)`], meaning: "brackets that grow to fit" },
  { codes: [String.raw`\cdot`, String.raw`\times`, String.raw`\div`], meaning: "· × ÷" },
  { codes: [String.raw`\pm`, String.raw`\mp`], meaning: "± ∓" },
  { codes: [String.raw`\le`, String.raw`\ge`, String.raw`\ne`, String.raw`\approx`], meaning: "≤ ≥ ≠ ≈" },
  { codes: [String.raw`\sum_{i=1}^{n}`], meaning: "sum" },
  { codes: [String.raw`\prod_{i=1}^{n}`], meaning: "product" },
  { codes: [String.raw`\int_{a}^{b}`], meaning: "integral" },
  { codes: [String.raw`\lim_{x \to 0}`], meaning: "limit" },
  { codes: [String.raw`\infty`], meaning: "∞" },
  { codes: [String.raw`\partial`, String.raw`\nabla`], meaning: "∂ ∇" },
  { codes: [String.raw`\to`, String.raw`\Rightarrow`, String.raw`\iff`], meaning: "→ ⇒ ⇔" },
  { codes: [String.raw`\in`, String.raw`\subseteq`, String.raw`\cup`, String.raw`\cap`], meaning: "∈ ⊆ ∪ ∩" },
  { codes: [String.raw`\alpha \beta \pi \theta \lambda`], meaning: "Greek (capitals: \\Delta \\Sigma \\Omega)" },
  { codes: [String.raw`\ldots`, String.raw`\cdots`], meaning: "… ⋯" },
  { codes: [String.raw`\vec{v}`, String.raw`\hat{x}`, String.raw`\bar{x}`], meaning: "accents" },
  { codes: [String.raw`\overline{AB}`], meaning: "line over" },
  { codes: [String.raw`\text{words}`], meaning: "normal text inside maths" },
  { codes: [String.raw`\mathbb{R}`, String.raw`\mathbf{x}`], meaning: "ℝ, bold" },
  { codes: [String.raw`\log`, String.raw`\ln`, String.raw`\sin`, String.raw`\cos`, String.raw`\max`], meaning: "upright function names" },
  { codes: [String.raw`\operatorname{softmax}`], meaning: "your own function name" },
  { codes: [String.raw`\\`], meaning: "new line (inside aligned, cases, matrices)" },
  { codes: [String.raw`&`], meaning: "column / alignment point" },
  { codes: [String.raw`\,`, String.raw`\;`, String.raw`\quad`, String.raw`\qquad`], meaning: "small → large space" },
  { codes: [String.raw`\%`, String.raw`\$`, String.raw`\{ \}`, String.raw`\_`], meaning: "literal % $ { } _" },
];
