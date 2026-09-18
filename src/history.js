// Background notes for each system: where it came from, what it was built to
// describe, and what is worth knowing about its behaviour. Written from the
// sources listed under each entry, which are the papers the attractor list
// already cites plus encyclopaedia and review material found alongside them.
//
// `origin` is the one-line attribution shown under the title. `text` is two or
// three paragraphs. `caveat`, where present, is shown in italics at the end and
// says plainly that the attribution here is weaker than the rest — several of
// these systems circulate in visualisation code under names that the primary
// literature does not clearly confirm, and guessing would be worse than saying so.

export const HISTORY = {

  "Lorenz": {
    origin: "Edward Lorenz, 1963",
    text: [
      "Edward Lorenz published these three equations in 1963 as a drastically truncated model of atmospheric convection, building on Barry Saltzman's earlier work on heated fluid layers. Only three Fourier modes survive the truncation: x is the intensity of the convective motion, y the temperature difference between rising and falling currents, and z the departure of the vertical temperature profile from a straight line. The parameters carry the physics — sigma is the Prandtl number, rho the Rayleigh number, and beta the geometry of the fluid layer.",
      "At Lorenz's values of sigma = 10, rho = 28 and beta = 8/3 the solution never settles. It winds around one lobe, crosses over, winds around the other, and the number of turns it takes on each side is not predictable from any finite observation. This was the point: a deterministic system with no noise in it whatsoever, whose long-range behaviour is nonetheless beyond forecasting. The phrase that stuck to it, the butterfly effect, describes both the sensitivity and, by coincidence, the shape.",
      "The attractor has a Hausdorff dimension of about 2.06 — a sheet that is not quite a surface. That it exists at all as a genuine strange attractor, rather than a very long transient that numerics could not distinguish from one, remained unproven for four decades. Warwick Tucker settled it in 2002 with a computer-assisted proof using interval arithmetic, answering the fourteenth of Stephen Smale's problems for the century."
    ],
    sources: ["https://en.wikipedia.org/wiki/Lorenz_system"]
  },

  "Rössler": {
    origin: "Otto Rössler, 1976",
    text: [
      "Otto Rössler designed this system in 1976 with an explicitly minimal brief: produce Lorenz-like chaos, but with as little machinery as possible. Two of the three equations are linear and the whole system carries a single quadratic term, which makes it far more tractable to analyse by hand than the Lorenz equations it was answering. Rössler's own parameters were a = 0.2, b = 0.2, c = 5.7.",
      "The mechanism is easy to watch. In the x-y plane the orbit spirals slowly outward around an unstable fixed point; when x grows past c, the z equation fires, lifting the trajectory sharply out of the plane and dropping it back near the centre. Outward spiral, sharp fold, repeat — stretching and folding in its plainest form, the same operation as kneading dough, which is what makes nearby points separate while the set as a whole stays bounded.",
      "Taking successive maxima of one coordinate collapses the flow to a one-dimensional map with a single hump, and that map period-doubles on the familiar route: period 1 near c = 4, then 2, then 4, then 8, then chaos interleaved with periodic windows. The attractor itself is a band joined to a Möbius strip, with Cantor-set structure across it. Though it began as a purely theoretical construction, the equations later turned out to describe kinetics in some chemical reactions."
    ],
    sources: ["https://en.wikipedia.org/wiki/R%C3%B6ssler_attractor"]
  },

  "Thomas": {
    origin: "René Thomas, 1999",
    text: [
      "René Thomas introduced this flow in 1999 in work on describing deterministic chaos in the language of feedback circuits. The three equations are cyclically symmetric: each is the same formula with x, y and z rotated by one position, so no axis is privileged and the whole picture is invariant under a 120-degree turn about the diagonal. The nonlinearity is a sine, which gives the system infinitely many fixed points arranged on a three-dimensional lattice.",
      "Thomas read it as a damped particle drifting through that lattice of forces, and the single parameter b is the damping. It is also a complete bifurcation parameter. Above b = 1 the origin is the only stable state. At b = 1 a pitchfork bifurcation splits off two attracting points; near b = 0.32899 a Hopf bifurcation produces a limit cycle; and near b = 0.208186 a period-doubling cascade tips the system into chaos, with the attractor swelling as b falls further.",
      "At b = 0 the damping vanishes entirely and the system becomes conservative. The trajectory then stops being confined to an attractor at all and wanders ergodically through the whole lattice, spreading in a way that resembles deterministic fractional Brownian motion. Few systems this compact span the conservative and dissipative regimes on a single dial."
    ],
    sources: ["https://en.wikipedia.org/wiki/Thomas%27_cyclically_symmetric_attractor"]
  },

  "Chen": {
    origin: "Guanrong Chen and Tetsushi Ueta, 1999",
    text: [
      "Guanrong Chen and Tetsushi Ueta published this double-scroll system in 1999. It looks like a near relative of Lorenz — same shape of quadratic coupling, same two-lobed silhouette — and that resemblance is the interesting part, because in a precise sense it is the opposite of Lorenz rather than a variant of it.",
      "Vaněček and Čelikovský had classified this family by the sign of the product a12·a21 in the linear part of the vector field. The Lorenz system sits in the branch where that product is positive. Chen's system satisfies a12·a21 < 0, which places it in a different equivalence class: not reachable from Lorenz by any smooth change of coordinates, despite the family likeness on screen. Chen's system is in this sense the dual of Lorenz's.",
      "Commonly quoted parameters are a = 40, c = 28, b = 3. The system became one of the most heavily worked examples in the applied chaos literature of the 2000s, largely because its two scrolls and comparatively wide chaotic parameter range make it convenient for circuit realisation and for synchronisation experiments."
    ],
    sources: ["https://en.wikipedia.org/wiki/Multiscroll_attractor", "https://www.worldscientific.com/doi/abs/10.1142/S0218127402005467"]
  },

  "Lü-Chen": {
    origin: "Jinhu Lü and Guanrong Chen, 2002",
    text: [
      "Jinhu Lü and Guanrong Chen constructed this system as the missing middle term between Lorenz and Chen. Under the Vaněček-Čelikovský classification by the sign of a12·a21, Lorenz occupies the positive branch and Chen the negative one; the Lü system is built to sit exactly at a12·a21 = 0, on the boundary between them.",
      "That makes it a bridge rather than another entry in the catalogue. Sweeping the relevant parameter carries the attractor continuously from Lorenz-like to Chen-like behaviour, passing through the degenerate case in between, so the two classes can be studied as endpoints of one family instead of as separate objects.",
      "The extended form adds a constant u to the second equation, which breaks the symmetry and lets the system generate multiscroll attractors; a = 36, c = 20, b = 3 and u = -15.15 is a standard setting. It is the same design logic as the rest of this group: rather than search for new chaos, take the structure of a known system and move it deliberately across a classification boundary."
    ],
    sources: ["https://en.wikipedia.org/wiki/Multiscroll_attractor", "https://www.researchgate.net/publication/220264958_BRIDGE_THE_GAP_BETWEEN_THE_LORENZ_SYSTEM_AND_THE_CHEN_SYSTEM"]
  },

  "Chen-Celikovsky": {
    origin: "Sergej Čelikovský and Guanrong Chen, after Vaněček and Čelikovský",
    text: [
      "This system comes out of the classification programme rather than from any physical problem. Antonín Vaněček and Sergej Čelikovský proposed a generalised Lorenz canonical form — a normal form into which a whole family of quadratic chaotic systems can be transformed — and then sorted the family by the sign of the product a12·a21 taken from the linear part.",
      "The point of a canonical form is that it turns a growing list of separately named attractors into a parameterised family with structure. Systems that merely look alike can be told apart, and systems that look different can turn out to be the same one in disguise. The Lorenz system, the generalised Lorenz systems, and the Chen system all appear as special cases of the one canonical form.",
      "The variant carried here sits in the Chen branch of that classification. Its interest is less in the picture it draws than in what it demonstrates: that these attractors are not a bestiary of unrelated curiosities but points in a single classified space, with the boundaries between classes doing real mathematical work."
    ],
    sources: ["https://www.worldscientific.com/doi/abs/10.1142/S0218127402005467", "https://www.sciencedirect.com/science/article/abs/pii/S0960077905001931"]
  },

  "Chen-Lee": {
    origin: "Hsien-Keng Chen and Ching-I Lee, 2004",
    text: [
      "Unlike most systems in this collection, the Chen-Lee equations were not assembled to produce chaos — they are the equations of motion of a real mechanical object. They are Euler's rigid-body equations for a gyroscope, with linear feedback control added, and they govern gyro motion directly rather than approximating it.",
      "That distinction matters. The Lorenz system is a severe truncation of convection, three modes standing in for a fluid; the Chen-Lee system is the governing set of equations for the motion it describes. Chaos here is a property of the controlled gyroscope itself, not an artefact of a modelling shortcut, which makes the system a cleaner test case for whether chaos in a control loop is physically real.",
      "The flow produces a two-scroll attractor. Later work extended it in the usual directions — fractional-order versions, hyperchaos induced by sinusoidal perturbation, control and chaotification through multiple time delays — with the alternative implementation of Sheu, Tam, Chen and Lao (2009) among the more cited follow-ups."
    ],
    sources: ["https://www.sciencedirect.com/science/article/abs/pii/S0960077908003524", "https://www.sciencedirect.com/science/article/abs/pii/S0960077906009295"]
  },

  "Duffing": {
    origin: "Georg Duffing, 1918",
    text: [
      "Georg Duffing (1861-1944) published the equation that carries his name in 1918, in a monograph on forced oscillation with variable natural frequency and its engineering significance. It is the oscillator every undergraduate meets, plus one term: a cubic in the restoring force. That single addition is the difference between a spring that obeys Hooke's law and every real spring.",
      "Written as ẍ + δẋ + αx + βx³ = γcos(ωt), the parameters divide cleanly — δ damps, α sets the linear stiffness, β sets how far the restoring force departs from linear, and γ and ω describe the driving. Positive β stiffens the spring as it stretches, negative β softens it. With α negative the potential has two wells, and the equation becomes the standard model of a buckled beam flipping between two bent states.",
      "The nonlinearity bends the frequency-response curve over on itself, so that over a band of driving frequencies three amplitudes are possible at once. Sweeping the frequency up and then down traces different paths and the amplitude jumps discontinuously at the turning points: the jump phenomenon, complete with hysteresis. Push the forcing harder and the response period-doubles its way into chaos. Duffing's equation is, among all the systems here, the one most likely to be describing something on your desk."
    ],
    sources: ["https://en.wikipedia.org/wiki/Duffing_equation"]
  },

  "Rabinovich-Fabrikant": {
    origin: "Mikhail Rabinovich and Anatoly Fabrikant, 1979",
    text: [
      "Mikhail Rabinovich and Anatoly Fabrikant derived these equations in 1979 to describe the stochastic self-modulation of waves in non-equilibrium dissipative media. The physical setting is a medium held away from equilibrium in which a wave, rather than propagating steadily, modulates itself into irregular behaviour. The parameter α measures the dissipation and γ the pumping that sustains the wave.",
      "The system is unusually nonlinear for a three-variable flow: it carries both quadratic and cubic terms, and it has five hyperbolic equilibria — one at the origin and four more whose existence depends on α and γ. At the standard chaotic setting γ = 0.87, α = 1.1 the correlation dimension is about 2.19 and the Lyapunov spectrum is roughly (0.198, 0, -0.658).",
      "It is also, by reputation, the hardest system in the standard catalogue to integrate honestly. Identical parameters and identical initial conditions run through different solvers — MATLAB against Mathematica — have produced visibly different trajectories. For a chaotic system that is expected in detail, but the scale of the divergence here makes it a standing warning about how much of a published phase portrait is the system and how much is the integrator."
    ],
    sources: ["https://en.wikipedia.org/wiki/Rabinovich%E2%80%93Fabrikant_equations"]
  },

  "Nosé-Hoover": {
    origin: "Shuichi Nosé, 1984; William Hoover, 1985",
    text: [
      "This flow comes from molecular dynamics rather than from chaos theory. Shuichi Nosé published the method in 1984 and William Hoover recast it in 1985. The problem it solves is that simulations naturally conserve energy, while laboratory experiments hold temperature fixed — so a simulation run as written samples the wrong statistical ensemble.",
      "Nosé's device was to add a degree of freedom: an extra variable coupled to the system's kinetic energy, acting as a heat bath made from a single fictitious particle. It behaves as a friction that can run in either direction, draining energy when the system is too hot and feeding it back when too cold. The resulting dynamics is fully deterministic, with no random forces, yet it samples the canonical NVT ensemble. A parameter Q sets how quickly the thermostat responds, and choosing it badly gives either ineffective thermostatting or spurious temperature oscillations.",
      "The catch, discovered soon after, is ergodicity. For a single harmonic oscillator the Nosé-Hoover thermostat does not generate a canonical distribution at all — the trajectory is chaotic but explores only part of the phase space it is supposed to cover. That failure prompted the Nosé-Hoover chains and the other refinements now in standard use, and it is why this small system is studied as a dynamical object in its own right."
    ],
    sources: ["https://en.wikipedia.org/wiki/Nos%C3%A9%E2%80%93Hoover_thermostat"]
  },

  "Rucklidge": {
    origin: "Alastair Rucklidge, 1992",
    text: [
      "Alastair Rucklidge derived this system in 1992 in Chaos in models of double convection (Journal of Fluid Mechanics 237, 209-229). Double convection is convection with a second competing effect — a dissolved solute, an imposed magnetic field, or rotation — and the paper gives a unified derivation of third-order models for two-dimensional convection in a Boussinesq layer with lateral constraints.",
      "In the limit of tall thin rolls, two physically distinct problems — convection in an imposed vertical magnetic field, and convection in a uniformly rotating layer — reduce to the same third-order set of equations. Its chaotic solutions are born in a homoclinic explosion, the same mechanism that produces chaos in the Lorenz equations.",
      "What sets it apart from Lorenz is honesty about its own validity. The Lorenz equations are a severe truncation, and the parameter values at which they go chaotic are far outside the range where the truncation can be justified. Rucklidge's derivation is asymptotically exact in the regime where the chaotic solutions actually appear, so the chaos it shows is chaos of the fluid problem rather than of the approximation."
    ],
    sources: ["https://www.cambridge.org/core/journals/journal-of-fluid-mechanics/article/abs/chaos-in-models-of-double-convection/29A1D82111941E50EE0D4A31DF09BE1D", "https://eprints.whiterose.ac.uk/id/eprint/974/"]
  },

  "Lorenz 1984": {
    origin: "Edward Lorenz, 1984",
    text: [
      "Twenty-one years after the convection model, Lorenz returned with a different three-equation system, published in Tellus in 1984 under the title Irregularity: a fundamental property of the atmosphere. Where the 1963 model describes a slab of fluid, this one is a minimal model of the global circulation: x is the strength of the westerly current, y and z the cosine and sine phases of the travelling waves that carry heat poleward.",
      "Two forcing terms, F and G, stand for the thermal contrast that drives the circulation — F for the symmetric equator-to-pole contrast, G for the asymmetric land-sea contrast. Depending on how hard they push, the equations admit one or two stable steady states, one or two stable periodic solutions, or aperiodic solutions. Weather regimes, an annual cycle and irregular interannual variability all appear in the same three equations as different parameter regimes.",
      "The argument in the title is the point of the paper. Irregularity in the atmosphere is not noise added to an otherwise orderly circulation, nor a sign that the model is missing physics; it is a property of the circulation itself, present in a system with three variables and no stochastic forcing anywhere in it. The model is still used as a testbed for predictability and for data assimilation schemes."
    ],
    sources: ["https://onlinelibrary.wiley.com/doi/10.1111/j.1600-0870.1984.tb00230.x", "http://www.atomosyd.net/spip.php?article42"]
  },

  "Hadley": {
    origin: "Named for the Hadley circulation; low-dimensional form after Lorenz",
    text: [
      "The Hadley cells are the largest overturning structure in the atmosphere: air rises near the equator at the intertropical convergence zone, moves poleward aloft, and descends in the subtropics, carrying moisture in and exporting energy and angular momentum out. This system is a three-variable caricature of that circulation, of the same lineage as Lorenz's 1984 model.",
      "The variables track the strength of the globally averaged symmetric westerly current and the cosine and sine phases of travelling waves transporting heat poleward, with forcing terms F and G standing in for the heating contrast. The nonlinear energy-exchange terms between them are what make the low-dimensional dynamics rich enough to be interesting.",
      "The behaviour as the equator-to-pole temperature difference is turned up follows a recognisable sequence: a stationary Hadley equilibrium first, then a periodic regime, and finally evolution on a strange attractor. That a climate model this small reproduces the transition at all is the reason these minimal circulation models remain in use as benchmarks for forecasting and data-driven modelling."
    ],
    sources: ["https://arxiv.org/pdf/2110.05266", "https://nyaspubs.onlinelibrary.wiley.com/doi/full/10.1111/nyas.15114"],
    caveat: "Attribution to a single originating paper is not firmly established; the low-dimensional Hadley model is generally traced to Lorenz's work on global circulation in the early 1980s."
  },

  "Aizawa": {
    origin: "William F. Langford, 1984",
    text: [
      "The system almost universally labelled the Aizawa attractor is more accurately Langford's. It first appeared in W. F. Langford's Numerical studies of torus bifurcations, in the proceedings of a 1983 Dortmund meeting published by Birkhäuser in 1984. The name in circulation among visualisation tools has drifted from the citation.",
      "The equations are a normal form, not a model of anything: they describe what happens when a Hopf bifurcation and a hysteresis bifurcation of stationary states interact — a Hopf-zero singularity unfolded in two parameters. Langford showed that under axisymmetric perturbations the flow produces an attracting invariant torus. Normal forms of this kind matter because whole classes of systems reduce to them near such a degeneracy, so one calculation covers many models.",
      "Breaking the axial symmetry is what makes the picture interesting. Non-axisymmetric perturbations bring phase locking, period doubling, bistability and strange attractors, with fractal basin boundaries between the coexisting states. The sphere-with-a-spike silhouette the system is admired for is the torus of the symmetric case with the symmetry broken."
    ],
    sources: ["https://link.springer.com/chapter/10.1007/978-3-0348-6256-1_19", "https://link.springer.com/article/10.1134/S199508022305058X"]
  },

  "Halvorsen": {
    origin: "Arne Dehli Halvorsen, circulated on sci.fractals",
    text: [
      "The Halvorsen attractor has an unusual provenance: Arne Dehli Halvorsen proposed it on the sci.fractals newsgroup rather than in a journal, and it reached the literature largely through J. C. Sprott at the University of Wisconsin, who collected and catalogued systems of this kind.",
      "Its organising principle is cyclic symmetry. The three equations are the same expression with x, y and z rotated by one place, so the flow is unchanged by a cyclic relabelling of the axes and the attractor is invariant under a 120-degree rotation about the main diagonal. The three curled lobes in the picture are not three separate features; they are one feature seen three times.",
      "It belongs to a small family that includes René Thomas's system, which imposes the same symmetry with an even simpler form — a linear damping plus a nonlinear function of the next variable round the cycle. Choosing a sine there gives infinitely many fixed points on a lattice; Halvorsen's quadratic choice gives this compact, tightly wound shape instead."
    ],
    sources: ["https://sprott.physics.wisc.edu/chaos/symmetry.htm", "https://en.wikipedia.org/wiki/Thomas%27_cyclically_symmetric_attractor"]
  },

  "Newton-Leipnik": {
    origin: "Roy Leipnik and T. A. Newton, 1981",
    text: [
      "Roy Leipnik and T. A. Newton published these equations in 1981 in a paper on double strange attractors in rigid body motion with linear feedback control. The starting point is Euler's equations for a rotating rigid body — classical mechanics, entirely well behaved — to which a linear feedback term is added. For suitable feedback gains the result is a system of three quadratic differential equations with two strange attractors.",
      "The plural is the point. The system does not have one attractor that trajectories find from anywhere; it has two coexisting ones, and which of them an orbit ends up on is decided by where it started. The phase space is divided into two basins, and in systems of this type the boundary between them is generally fractal, so arbitrarily small differences in the initial state can send trajectories to different long-run behaviours.",
      "Wang and Tian later attached the Newton-Leipnik name to the system, and it became a standard test case for chaos control and synchronisation — partly because controlling a system with coexisting attractors means choosing between them, not merely suppressing chaos. Fractional-order variants have been studied extensively since."
    ],
    sources: ["https://www.sciencedirect.com/science/article/abs/pii/0375960181901651", "https://arxiv.org/pdf/nlin/0501014"]
  },

  "Genesio-Tesi": {
    origin: "Roberto Genesio and Alberto Tesi, 1992",
    text: [
      "Roberto Genesio and Alberto Tesi arrived at this system in 1992 from the control-theory side, while looking for algebraic conditions that would predict chaos rather than merely confirm it after the fact. Their tool was harmonic balance — approximate a system's response by its leading sinusoidal components and ask when that approximation breaks down in a way that signals chaos.",
      "What falls out is the canonical jerk equation, x⃛ + aẍ + bẋ + x(1 + x) = 0, written as a three-dimensional system. Jerk is the derivative of acceleration, and a jerk equation is the shortest honest way to write a third-order scalar ODE as a flow: the first two equations simply pass the derivative along, and all the dynamics lives in the third. The nonlinearity here is a single quadratic term.",
      "The parameters a and b are the bifurcation parameters, and the system has exactly two equilibria — one at the origin, one at (-1, 0, 0). Its later career has been mostly in fractional-order form, in synchronisation studies and in weak-signal detection, where a chaotic system poised near a bifurcation is used as an amplifier for signals buried in noise."
    ],
    sources: ["http://www.atomosyd.net/spip.php?article153", "https://www.mdpi.com/2504-3110/9/2/74"]
  },

  "Arneodo": {
    origin: "Alain Arneodo, Pierre Coullet and Charles Tresser, 1981",
    text: [
      "Alain Arneodo, Pierre Coullet and Charles Tresser proposed this system in Possible new strange attractors with spiral structure (Communications in Mathematical Physics, 1981), following their 1979 work with Tresser on the transition to stochasticity in forced oscillators. The attractor list here cites their 1982 paper applying the same structure to Volterra equations for competing species.",
      "The form is a jerk equation: ẋ = y, ẏ = z, and all the content in the third equation, where a cubic nonlinearity sits alongside linear terms. Writing chaos in this shape makes it clear how little is needed — a single scalar third-order ODE with one nonlinear term, with the first two equations doing nothing but relaying derivatives.",
      "Its importance is that it exhibits Shilnikov chaos explicitly. Shilnikov's theorem says that a homoclinic orbit to a saddle-focus, under a condition on the eigenvalues, forces infinitely many periodic orbits and chaotic dynamics nearby. Systems where that orbit can actually be located are valuable because the chaos is then proved rather than observed, and the spiral structure in the phase portrait is the saddle-focus at work."
    ],
    sources: ["https://link.springer.com/article/10.1007/BF01011745", "https://link.springer.com/article/10.1007/BF01832841"]
  },

  "Coullet": {
    origin: "Pierre Coullet, Charles Tresser and Alain Arneodo, 1979-1981",
    text: [
      "This system comes from the same Nice group and the same programme as the Arneodo equations: Coullet, Tresser and Arneodo's Transition to stochasticity for a class of forced oscillators (Physics Letters A, 1979) and the spiral-structure paper that followed in 1981. The two systems are close relatives, differing in the placement and degree of the nonlinear terms.",
      "Like the Arneodo system it is written in jerk form, with a cubic nonlinearity carrying the dynamics. The group's concern was not to collect attractors but to understand the routes by which ordinary oscillators become chaotic, and to tie those routes to structures — homoclinic orbits to a saddle-focus — that could be identified and reasoned about rather than merely plotted.",
      "Coullet and Tresser are also the authors, independently of Feigenbaum, of the renormalisation theory of period doubling, which explains why the doubling cascade has universal constants across systems that share nothing else. The same instinct runs through this system: find the structure that makes the behaviour inevitable, rather than catalogue the behaviour."
    ],
    sources: ["https://link.springer.com/article/10.1007/BF01011745", "https://en.wikipedia.org/wiki/Chaos_theory"]
  },

  "Anishchenko-Astakhov": {
    origin: "Vadim Anishchenko and Vladimir Astakhov, 1983",
    text: [
      "The Anishchenko-Astakhov oscillator is a radiophysical generator rather than an abstraction — the equations are derived from an actual radio-technical circuit, built so that the conditions for chaotic self-sustained oscillation are met. It dates from 1983, and Anishchenko's 1986 doctoral thesis on chaos in radiophysical systems with finitely many degrees of freedom was the first work in the Soviet Union devoted entirely to dynamical chaos.",
      "A self-sustained oscillator is one that produces oscillation from a steady energy source, with no periodic driving: the timing comes from the system, not from outside. Making such an oscillator chaotic rather than periodic is a design problem, and the underlying reason it can be done here is the presence of a homoclinic trajectory in the form of a saddle-focus separatrix loop — the Shilnikov mechanism, arrived at through circuit design rather than through analysis.",
      "Because it exists as hardware, the oscillator became the setting for experiments that would be hard to argue for in simulation alone. Chaos synchronisation — the locking of the basic frequency of a chaotic oscillation to an external drive — was demonstrated experimentally for the first time on a harmonically driven Anishchenko-Astakhov generator."
    ],
    sources: ["https://fizika.sgu.ru/en/articles/anishchenko-astakhov-self-sustained-oscillator-as-one-of-the-basic-models-of-deterministic", "https://link.springer.com/chapter/10.1007/978-3-319-06871-8_11"]
  },

  "Burke-Shaw": {
    origin: "Robert Shaw, 1981, with Bill Burke",
    text: [
      "Robert Shaw's Strange Attractors, Chaotic Behavior, and Information Flow (Zeitschrift für Naturforschung A 36, 80-112, 1981) is one of the founding papers of the information-theoretic view of chaos. Shaw's question was not what the attractor looks like but how much information it produces: a chaotic system generates new information at a definite rate, because digits that were below the resolution of any measurement are continuously promoted into significance.",
      "The system named for Shaw and his Santa Cruz colleague Bill Burke is Lorenz-like and, like Lorenz, equivariant under a rotation symmetry — the flow commutes with a half-turn about an axis, which is why the attractor comes in two mirrored lobes. Near its standard parameters it shows the attractor that recurs across Lorenz-like systems generally.",
      "Shaw's framing in that paper — that the observed geometry of strange attractors follows from a rule permitting trajectories to join but never to split — was an early attempt at classifying three-dimensional strange attractors by structure rather than by appearance, and it anticipated the template and branched-manifold methods that came later."
    ],
    sources: ["https://degruyter.com/view/journals/zna/36/1/article-p80.xml?language=en", "http://www.atomosyd.net/spip.php?article33"]
  },

  "Bouali": {
    origin: "Safieddine Bouali, 2013",
    text: [
      "Safieddine Bouali is an economist at the University of Tunis, and his chaotic systems were built as heuristic models of economic cycles — in particular of capital flight from less developed countries. The system here comes from A 3D Strange Attractor with a Distinctive Silhouette: The Butterfly Effect Revisited (2013), and derives from the coupling-induced complexity of the Lotka-Volterra oscillator, the classic predator-prey model.",
      "The attractor is a double scroll bridged by a loop, and varying a single parameter deforms it into a single scroll with a long stretched loop. The silhouette of the title is not decoration: Bouali's argument is that the shape is topologically unlike the standard catalogue of attractors, not another rendering of a Lorenz-like object.",
      "The subtitle's claim is the sharper one. Bouali reports that varying the initial conditions leads not merely to different trajectories on one attractor but to different attractors, and to a regime of overlapped attractors coexisting in the same region of phase space. Sensitive dependence on initial conditions in Lorenz's sense concerns trajectories; this is sensitivity in which attractor you end up on at all."
    ],
    sources: ["https://arxiv.org/abs/1311.6128", "https://arxiv.org/pdf/1204.0045"]
  },

  "Bouali 2": {
    origin: "Safieddine Bouali, 2012-2013",
    text: [
      "The second Bouali system is from the same programme of using three-variable flows as heuristic models of economic cycles, and shares the first system's ancestry in the Lotka-Volterra oscillator. Where the first emphasises a double scroll bridged by a loop, this variant is associated with A Novel Strange Attractor with a Stretched Loop (2012), in which a single parameter stretches the loop out.",
      "The economic reading is deliberate but loose. The variables are not measured quantities; the model is an argument that the qualitative features of cycles — recurrence without periodicity, abrupt regime change, sensitivity to starting conditions — arise from coupling alone, and need neither external shocks nor stochastic terms to appear.",
      "For the purposes of a screensaver the provenance matters less than the geometry: a stretched loop joining the scrolls gives it a silhouette quite unlike the Lorenz family, which is precisely what Bouali set out to produce."
    ],
    sources: ["https://arxiv.org/abs/1204.0045", "https://arxiv.org/abs/1311.6128"]
  },

  "Qi-Chen": {
    origin: "Guanrong Qi, Guanrong Chen, Shengzhi Du, Zengqiang Chen and Zhuzhi Yuan, 2005",
    text: [
      "Published as Analysis of a new chaotic system in Physica A 352 (2005), this system was obtained by modifying a hybrid optical system into a three-dimensional continuous quadratic autonomous flow. Its structural signature is that every equation carries a single quadratic cross-product term — a different arrangement from Lorenz, Rössler, Chen or Lü, all of which distribute their nonlinearity differently.",
      "The system has five equilibria, and the bifurcation analysis walks through a long sequence of regimes as parameters move: two coexisting sinks, then two coexisting periodic orbits, then two coexisting single-wing chaotic attractors, then double-wing attractors along the major and minor diagonals, and finally a four-wing attractor.",
      "That progression is the reason the paper is cited so heavily. A four-wing attractor is not a decorative variation on the two-lobed butterfly; it is what two coexisting single-wing attractors become when they merge, and this system lets the merging be followed step by step rather than asserted. The Qi four-wing system has since been extended to eight-wing forms."
    ],
    sources: ["https://www.academia.edu/10985120/Analysis_of_a_new_chaotic_system", "https://link.springer.com/article/10.1007/s11071-016-2949-0"]
  },

  "Four-wing": {
    origin: "Four-wing quadratic system, after Z. Wang and colleagues",
    text: [
      "Four-wing attractors are the subject of a substantial literature of their own. The two-lobed butterfly of Lorenz has a pair of wings because the flow winds around two unstable equilibria; a four-wing attractor requires enough equilibria, arranged the right way, for the trajectory to visit four such regions in one connected set, and constructing quadratic systems that do this reliably took some searching.",
      "The system here has the form ẋ = ax + cyz, ẏ = bx + dy − xz, ż = ez + fxy, at a = 0.2, b = −0.01, c = 1, d = −0.4, e = −1, f = −1 — a setting analysed by Z. Wang and colleagues. Each equation carries exactly one quadratic cross-product, and the four wings appear over a wide parameter range rather than at an isolated point, which is what makes the system useful rather than merely curious.",
      "Worth noting: in this collection the entry named Wang-Sun carries exactly the same equations at exactly the same parameter values. The two are one system under two names, which is a common hazard in attractor catalogues, where systems travel between visualisation tools faster than their citations do."
    ],
    sources: ["https://link.springer.com/article/10.1007/s11071-009-9607-8", "https://www.sbfisica.org.br/bjp/files/v39_547.pdf"],
    caveat: "The name attached to this parameter set varies across sources; the underlying four-wing quadratic form is well documented, the label less so."
  },

  "Wang-Sun": {
    origin: "Four-wing quadratic system, after Z. Wang and colleagues",
    text: [
      "The Wang-Sun name is attached in the visualisation literature to a four-wing quadratic system of the form ẋ = ax + cyz, ẏ = bx + dy − xz, ż = ez + fxy. Zenghui Wang and Yanxia Sun published together in the early 2010s on chaotic and hyperchaotic systems characterised by their equilibrium structure, including a four-dimensional system with no equilibria at all (Nonlinear Dynamics 69, 531-537, 2012).",
      "Classifying these systems by their equilibria is not bookkeeping. An attractor whose basin does not touch any unstable equilibrium is called hidden, and hidden attractors cannot be found by the standard method of perturbing an equilibrium and following the trajectory — you have to know where to look. A system with no equilibria at all has only hidden attractors, which is why the no-equilibrium cases drew attention.",
      "In this collection the equations filed under Wang-Sun are identical, parameter for parameter, to those filed under Four-wing. They are the same system entered twice, and the duplication is worth knowing about when comparing the two on screen."
    ],
    sources: ["https://link.springer.com/article/10.1007/s11071-011-0284-z", "https://link.springer.com/article/10.1007/s11071-009-9607-8"],
    caveat: "The attachment of the Wang-Sun name to this specific parameter set is not confirmed in a primary source; the equations are the well-documented four-wing quadratic form."
  },

  "Yu-Wang": {
    origin: "Yu and Wang, 2012",
    text: [
      "The Yu-Wang system is unusual in this company for its nonlinearity: where almost every other entry here is quadratic, the third equation carries an exponential, exp(xy). Quadratic terms are the natural output of truncating a physical model; an exponential is a deliberate choice, and it gives the system a much steeper response as the product xy grows.",
      "Reported by Yu and Wang in 2012, the system generates a four-wing chaotic attractor, and does so in any orientation — the four wings can be produced along all three-dimensional directions and in the two-dimensional coordinate planes, rather than being locked to one set of axes.",
      "Later analysis found rich multistability: coexisting chaotic attractors, coexisting stable nodes and coexisting limit cycles, depending on parameters and initial conditions, together with transient one-wing and two-wing chaos and offset boosting — a translation of the attractor through phase space driven by a single parameter. It has been implemented on FPGA hardware, where the exponential is the expensive part."
    ],
    sources: ["https://www.researchgate.net/publication/343972893_Multistability_Analysis_Coexisting_Multiple_Attractors_and_FPGA_Implementation_of_Yu-Wang_Four-Wing_Chaotic_System"],
    caveat: "The 2012 Yu and Wang attribution comes from secondary literature on the system rather than from the original paper, which was not retrieved."
  },

  "Dadras": {
    origin: "Sara Dadras and Hamid Reza Momeni, 2009",
    text: [
      "Sara Dadras and Hamid Reza Momeni published this system in Physics Letters A in September 2009, under a title that states its selling point plainly: a novel three-dimensional autonomous chaotic system generating two, three and four-scroll attractors.",
      "The number of scrolls is controlled by a single parameter. Most systems in the catalogue produce one characteristic shape and require a different system to produce another; here two-, three- and four-scroll attractors are regimes of the same equations, reachable by turning one dial. That makes the transitions between them observable rather than inferential.",
      "The authors worked through the standard battery — phase portraits and time histories, Poincaré maps, bifurcation diagrams and Lyapunov exponents — to establish that the multi-scroll regimes are genuinely chaotic rather than long-period. The system has since been extended to hyperchaotic form and used as a control-theory test case under the name Dadras-Momeni."
    ],
    sources: ["https://www.sciencedirect.com/science/article/abs/pii/S0375960109009591", "https://www.researchgate.net/publication/274511798_The_chaotic_Dadras-Momeni_system_Control_and_hyperchaotification"]
  },

  "Finance": {
    origin: "Junhai Ma and Yushu Chen, 2001",
    text: [
      "The three variables here are economic quantities: x is the interest rate, y the investment demand and z the price index. Junhai Ma and Yushu Chen published the model in 2001 in a study of the bifurcation structure and global behaviour of a nonlinear finance system, with the saving amount, the elasticity of demand and the cost per investment entering as parameters.",
      "The claim the model makes is specific. Financial time series are irregular, and the conventional explanation is that they are driven by external shocks — news, policy, weather. This system has no shocks in it. Its irregularity comes from the coupling between interest rate, investment demand and price index alone, which is an argument that some part of observed financial volatility may be endogenous.",
      "The system carries coexisting equilibria, periodic orbits, Hopf bifurcations and chaotic attractors, and has become the standard starting point for a large body of work on chaotic financial models: fractional-order versions, time-delayed feedback control, hyperchaotic four-dimensional extensions, and control strategies aimed at stabilising the chaotic regime."
    ],
    sources: ["https://www.researchgate.net/publication/228929943_A_new_finance_chaotic_attractor", "https://link.springer.com/article/10.1007/s11071-014-1749-7"]
  },

  "TSUCS1": {
    origin: "Lin Pan, Wuneng Zhou, Jian'an Fang and Dequan Li, 2010",
    text: [
      "TSUCS stands for Three-Scroll Unified Chaotic System. It was introduced by Lin Pan, Wuneng Zhou, Jian'an Fang and Dequan Li around 2010, following Dequan Li's three-scroll attractor in Physics Letters A 372 (2008), 387-393.",
      "The word unified is the claim. The system is built so that Lorenz-like and Chen-like attractors both appear as limiting cases within its own parameter space, with the three-scroll regime living between them. Rather than adding one more attractor to the catalogue, it provides a single family in which two of the standard ones are endpoints of a continuous sweep.",
      "Three scrolls sits awkwardly between the familiar counts. Two-scroll attractors arise from a symmetric pair of unstable equilibria, and four-scroll ones from two such pairs; three requires the symmetry to be broken in a particular way. The system has been used for synchronisation work, including active pinning control of its hyperchaotic extension."
    ],
    sources: ["https://www.semanticscholar.org/paper/A-New-Three-Scroll-Unified-Chaotic-System-Coined-Pan-Zhou/24e0f03058fbc8f8071b0fb0372afd3046f7c453", "https://www.semanticscholar.org/paper/A-three-scroll-chaotic-attractor-Li/dbeb673b0a2542d75e26a18a095672f917176398"]
  },

  "TSUCS2": {
    origin: "Second form of the Three-Scroll Unified Chaotic System, after Dequan Li, 2008",
    text: [
      "TSUCS2 is the second parameterisation of the Three-Scroll Unified Chaotic System, sharing its lineage with TSUCS1 in Dequan Li's three-scroll attractor (Physics Letters A 372, 2008, 387-393) and the unified system that followed.",
      "The two forms differ in how the quadratic terms are weighted rather than in kind, and the visible consequence is a markedly different silhouette: where TSUCS1 reads as three lobes of comparable size, TSUCS2 draws a longer, more drawn-out shape. Both retain the property that gives the family its name — Lorenz-like behaviour at one extreme of the parameter space and Chen-like behaviour at the other.",
      "Systems of this kind exist mainly to make the structure of the catalogue visible. If Lorenz and Chen can be connected by a continuous path through parameter space, then the boundary between them is a feature of the family rather than of either system, and the three-scroll regime found along the way is what that boundary looks like."
    ],
    sources: ["https://www.semanticscholar.org/paper/A-three-scroll-chaotic-attractor-Li/dbeb673b0a2542d75e26a18a095672f917176398", "https://rreusser.github.io/demos/plots/tsucs2.html"]
  },

  "Liu-Chen": {
    origin: "Liu and Chen, 2004",
    text: [
      "Liu and Chen asked a sharply posed question in the International Journal of Bifurcation and Chaos in 2004: can a three-dimensional smooth autonomous quadratic system generate a single four-scroll attractor? The interest is in the word single. Four-scroll pictures can be produced by two separate two-scroll attractors coexisting in the same phase space, which is a different object from one connected attractor with four scrolls.",
      "The system they found carries one quadratic cross-product in each equation and no constant terms, in the form ẋ = ax − yz, ẏ = −by + xz, ż = −cz + xy. It displays a two-scroll attractor and, in the appropriate regime, a visually four-scroll one.",
      "Work of this kind belongs to a period in the mid-2000s when the generalised-Lorenz classification had made it clear which structural features of a quadratic vector field control the number and arrangement of scrolls, and several groups set about constructing systems that would realise the possibilities the classification allowed."
    ],
    sources: ["https://link.springer.com/chapter/10.1007/978-3-319-00542-3_31", "https://www.sciencedirect.com/science/article/abs/pii/S0375960107010584"],
    caveat: "The Liu and Chen 2004 attribution comes from secondary literature; the original paper was not retrieved, and this parameter set may not be the one it published."
  },

  "Sakarya": {
    origin: "Associated with İbrahim Pehlivan and Yılmaz Uyaroğlu, Sakarya University",
    text: [
      "The Sakarya system is named for Sakarya University in Turkey, whose electrical and electronic engineering group — in particular İbrahim Pehlivan and Yılmaz Uyaroğlu — produced a series of three-dimensional chaotic systems in the late 2000s and 2010s. The system is described in that literature as a three-dimensional flow with two chaos parameters, derived by modifying the Lorenz system.",
      "The equations here, ẋ = −x + y + yz, ẏ = −x − y + 0.4xz, ż = z − 0.3xy, show the group's characteristic emphasis. The linear part is simple and the nonlinearity is a single cross-product in each equation, which is exactly what makes a system straightforward to build from operational amplifiers and analogue multipliers — and circuit realisation, not abstract classification, is what this body of work is aimed at.",
      "That orientation explains the applications the group pursued: analogue circuit implementations, image encryption, S-box design for block ciphers, and chaos-based random number generation. A chaotic system that cannot be built is of limited use for any of these, so the design constraint is buildability rather than mathematical novelty."
    ],
    sources: ["https://www.mdpi.com/1099-4300/20/1/12", "https://www.researchgate.net/publication/309209139_Basic_dynamical_analyses_and_electronic_circuit_implementation_of_a_new_3D_chaotic_system"],
    caveat: "No primary paper naming this exact system Sakarya was located; the attribution to the Sakarya University group rests on secondary descriptions."
  },

  "Akgul-Pehlivan": {
    origin: "Akif Akgül and İbrahim Pehlivan, 2016",
    text: [
      "Akif Akgül and İbrahim Pehlivan published this system in Tehnički Vjesnik 23(1) (2016), 209-214, as a new three-dimensional chaotic system without equilibrium points, together with its dynamical analysis and an electronic circuit implementation.",
      "A system with no equilibria is a stronger statement than it sounds. The standard way to find a chaotic attractor is to locate an unstable equilibrium, perturb it, and follow where the trajectory goes; an attractor found that way is called self-excited. If a system has no equilibria at all, that method has nothing to start from, and every attractor it possesses is hidden — its basin touches no equilibrium, so it can only be found by knowing roughly where to look.",
      "Hidden attractors became a serious topic in the 2010s after they were shown to matter in engineering practice, where a system can appear stable under every equilibrium-based test and still have a large-amplitude oscillation waiting in an untested corner of phase space. Akgül and Pehlivan's contribution was to give a no-equilibrium system that could be built as a circuit and shown to behave as analysed."
    ],
    sources: ["https://www.researchgate.net/publication/295254269_A_New_Three-Dimensional_Chaotic_System_Without_Equilibrium_Points_Its_Dynamical_Analyses_and_Electronic_Circuit_Application", "https://link.springer.com/chapter/10.1007/978-3-030-75821-9_4"]
  },

  "Rayleigh-Benard": {
    origin: "Lorenz-form truncation of Rayleigh-Bénard convection",
    text: [
      "Rayleigh-Bénard convection is the canonical experiment in fluid instability: a layer of fluid heated from below and cooled from above. Below a critical temperature difference heat moves by conduction and nothing stirs; above it the layer breaks into rolls. What happens as the heating is increased further — steady rolls, then time-periodicity, quasiperiodicity, phase locking, chaos and crisis — is the standard route by which a continuous fluid becomes unpredictable.",
      "Reducing the governing partial differential equations to three ordinary ones takes a severe truncation: assume two-dimensional rolls, expand the stream function and the temperature perturbation in Fourier series, and keep one mode of the first and two of the second. The result is the Lorenz system. The equations carried here are of exactly that form, ẋ = 9(y − x), ẏ = 12x − y − xz, ż = xy − 0.5z, differing from Lorenz's only in the constants.",
      "Keeping it as a separate entry is defensible for the same reason the truncation is worth making twice: the Lorenz constants were chosen to sit in a chaotic regime far outside the range where three modes can be justified as a description of the fluid, and running the same skeleton at other constants shows how much of the picture depends on that choice."
    ],
    sources: ["https://www.sciencedirect.com/science/article/abs/pii/S0960077905006211", "https://www.sciencedirect.com/science/article/pii/S0307904X20303383"],
    caveat: "No primary source names this exact parameter set; the entry describes the standard Lorenz-form truncation of the Rayleigh-Bénard problem, which these equations reproduce."
  },

  "Lorenz Mod 1": {
    origin: "Modified Lorenz system, origin uncertain",
    text: [
      "This system and its companion circulate through visualisation software and attractor galleries under the Lorenz Mod names. The equations are not the Lorenz system with different constants; they are a different vector field, sharing only the ancestry implied by the name.",
      "The structure is distinctive. The first equation, −αx + y² − z² + αβ, is quadratic in the two variables it does not govern and carries a constant term — a form closer to Lorenz's 1984 circulation model than to the 1963 convection one. The second and third couple x against a linear combination of y and z, with the factor 4 appearing in both; in Lorenz Mod 2 that factor becomes 5 and the sign of the z term flips.",
      "The very small integration step used here, dt = 0.001, is a practical consequence of those squared terms: the vector field grows quickly away from the origin, and a larger step sends trajectories off to infinity rather than onto the attractor."
    ],
    sources: ["https://www.vorillaz.com/lorenz-mod-2-attractor/"],
    caveat: "No primary source for this system was found. The name is what visualisation tools call it; the description above is drawn from the equations themselves rather than from a paper."
  },

  "Lorenz Mod 2": {
    origin: "Modified Lorenz system, origin uncertain",
    text: [
      "The second of the pair, differing from Lorenz Mod 1 in three specific ways: the coupling factor is 5 rather than 4, the linear z term in the third equation is negative rather than positive, and the parameters are much larger — α = 0.9 against 0.1, β = 9.9 against 14, γ = 1 against 0.08.",
      "Those changes produce a visibly different object. Where Mod 1 stays comparatively compact, Mod 2 opens into the broad, symmetric, many-looped shell that has made it a favourite of attractor galleries and 3D-printing projects. The two are best read as one family sampled at two points rather than as separate discoveries.",
      "As with its companion, the attribution is the weak part. The equations are reproduced consistently across visualisation tools, but the chain of citation back to a paper is missing, and what can be said with confidence about the system comes from reading the vector field rather than from any published analysis."
    ],
    sources: ["https://www.vorillaz.com/lorenz-mod-2-attractor/", "https://www.shapeways.com/product/KFYWKY4JG/lorenz-mod-2-attractor"],
    caveat: "No primary source for this system was found. The name is what visualisation tools call it; the description above is drawn from the equations themselves rather than from a paper."
  },

  "Genus-5 Multispiral": {
    origin: "Moulay Aziz-Alaoui, 1999",
    text: [
      "Moulay Aziz-Alaoui introduced this system in Differential equations with multispiral attractors (International Journal of Bifurcation and Chaos 9, 1009-1039, 1999), achieving multispiral attractors in the non-autonomous case for the first time. The nonlinearity is piecewise-linear, with three regions set by thresholds and three slopes — the same construction principle as Chua's circuit, extended.",
      "Multispiral means more than the double scroll that Chua's circuit is famous for: the piecewise-linear function is given enough breakpoints that the trajectory winds around a whole row of unstable regions rather than two. Standard parameters are α = 14.6, β = 12, γ = 0.9.",
      "Genus-5 is a topological statement, and a precise one. Every chaotic attractor in three dimensions can be bounded by a surface, and the genus of that surface — the number of holes in it — is an invariant that does not change under smooth deformation. A Lorenz-like attractor is bounded by a genus-3 surface; this one needs genus 5. Martin Rosalie and Christophe Letellier developed the procedure for extracting templates from attractors bounded by high-genus tori and applied it here in 2014."
    ],
    sources: ["https://www.worldscientific.com/doi/10.1142/S0218127499000729", "http://www.atomosyd.net/spip.php?article137"]
  },

  "A Semi-Conductor Laser": {
    origin: "Sebastian Wieczorek, Bernd Krauskopf and Daan Lenstra, 1999",
    text: [
      "This is a laser, described as a dynamical system. A single-mode class B semiconductor laser is fed monochromatic light from another laser — optical injection — and the question is what the injected light does to the output. Wieczorek, Krauskopf and Lenstra gave a unifying account of the bifurcations involved in Optics Communications 172 (1999), 279-295.",
      "The three variables are physical: x and y are the components of the electric field inside the laser cavity, and z is the normalised population inversion, the excess of excited over unexcited carriers that makes amplification possible. The parameters are equally concrete — K is the strength of the injected field, α the linewidth enhancement factor coupling amplitude to phase, B the photon cavity lifetime and Γ the damping rate.",
      "At K = 0.3, ω = 0, α = 8, B = 0.015 and Γ = 0.035 the attractor is toroidal, with a Kaplan-Yorke dimension of about 2.76. Konstantinos Chlouverakis and Julian Sprott proposed a simplified model in 2004 that produces comparable toroidal chaos at dimension 2.54, showing that much of the laser's behaviour survives considerable stripping-down. Optical injection remains a practical concern: it is how a laser is locked to a reference, and these bifurcations mark where the locking fails."
    ],
    sources: ["https://research-information.bris.ac.uk/en/publications/a-unifying-view-of-bifurcations-in-a-semiconductor-laser-subject-", "http://www.atomosyd.net/spip.php?article129"]
  },

  "Multi-folded Toroidal": {
    origin: "Alexander Kuznetsov, Sergey Kuznetsov and Nataliya Stankevich, 2010",
    text: [
      "Alexander Kuznetsov, Sergey Kuznetsov and Nataliya Stankevich published this system in Communications in Nonlinear Science and Numerical Simulation 15 (2010), 1676-1681, under the title A simple autonomous quasiperiodic self-oscillator. Their thesis was economical: to produce chaos, it is enough to combine an oscillator with a nonlinear switch.",
      "The physical picture is a relaxation oscillator. A capacitor charges slowly through a resistor until it reaches an ignition threshold, discharges rapidly, and begins again once the voltage falls to an extinction threshold — the circuit behind a flashing neon lamp. Coupled to an oscillator, this threshold behaviour is sufficient to generate quasiperiodic motion autonomously, with no external forcing supplying a second frequency.",
      "The route to chaos is the Curry-Yorke scenario. As the parameter μ is reduced from above 1 the motion passes from periodic through quasiperiodic regimes interleaved with periodic windows; approaching the rotation axis, the torus on which the motion lives begins to fold. Progressive folding of an invariant torus turns quasiperiodicity into chaos, and the multi-folded toroidal structure that results is what the surface-of-section plots show."
    ],
    sources: ["https://www.researchgate.net/publication/222396257_A_simple_autonomous_quasiperiodic_self-oscillator", "http://www.atomosyd.net/spip.php?article220"]
  },

  "Unimodal Toroidal": {
    origin: "Bo Deng, 1994",
    text: [
      "Bo Deng introduced this system in Constructing homoclinic orbits and chaotic attractors (International Journal of Bifurcation and Chaos 4, 1994, 823-841). The title states the method: rather than search parameter space for chaos and then analyse what turns up, build the homoclinic orbit that forces chaos and let the attractor follow.",
      "Toroidal chaos is rare in three-dimensional autonomous continuous systems. Rössler produced a toroidal system in 1979, but it was not chaotic; Deng's is among the first to give chaos on a torus in this setting. The construction combines rotation with a radial constraint and a z-dependent amplitude modulation, which is what holds the torus topology in place while the dynamics on it becomes chaotic.",
      "Unimodal refers to the first-return map. Taking a Poincaré section and plotting each crossing against the next gives a map with a single hump — one fold, not several. A unimodal map is the simplest object that can support a period-doubling cascade, and finding one here means the chaos on this torus is organised by a single folding mechanism rather than by several competing ones."
    ],
    sources: ["https://www.worldscientific.com/doi/abs/10.1142/S0218127494000599", "http://www.atomosyd.net/spip.php?article67"]
  },

  "Cord Attractor": {
    origin: "Christophe Letellier and Luis A. Aguirre, 2012",
    text: [
      "The cord system was found by Christophe Letellier and Luis Aguirre in 2012, and by their own account Aguirre found it by mistake while working with variants of earlier systems. It is a modification of Lorenz's 1984 circulation model: the nonlinear terms in the first equation were replaced with linear equivalents, and the result turned out not to be equivalent to any known attractor.",
      "The name comes from the shape — the main rotation seen in the y-z plane projection reads as a twisted cord. The system is also a standard example of poor observability: two of its three variables are bad choices for reconstructing the dynamics, in the sense that a time series of either one does not carry enough information to recover the attractor. Which variable you measure is not a free choice, and this system makes the point sharply.",
      "Its first-return map is a smooth unimodal map whose decreasing branch becomes layered as a parameter is varied — a visible warning that a crisis is approaching. Past a boundary crisis at b ≈ 4.046 the attractor abruptly becomes much larger and considerably more complex."
    ],
    sources: ["http://www.atomosyd.net/spip.php?article185"]
  },

  "Torn Unimodal Chaos": {
    origin: "Otto Rössler and Peter Ortoleva, 1978",
    text: [
      "Otto Rössler and Peter Ortoleva proposed this system in Strange attractors in 3-variable reaction systems (Lecture Notes in Biomathematics 21, 1978, 67-73). The setting is an abstract isothermal chemical reaction — chemistry at fixed temperature, where the irregularity cannot be blamed on thermal effects and must come from the reaction kinetics themselves.",
      "Torn names the mechanism. Chaos in three dimensions is produced by stretching phase space and then bringing it back on itself, and there are two ways to do the second part: fold it, as the Rössler attractor does, or tear it, splitting the flow into sheets that are reassembled elsewhere, as the Lorenz attractor does. The two produce topologically different attractors, distinguishable by their branched manifolds.",
      "What makes this system notable is that it tears without the rotational symmetry that the Lorenz system relies on, and produces an attractor bounded by a genus-1 torus. Its first-return map has the cusped shape of a Lorenz map while being genuinely unimodal. The result showed that tearing is not a consequence of symmetry, and that it arises in a plausible chemical setting rather than only in a convection caricature."
    ],
    sources: ["http://www.atomosyd.net/spip.php?article65"]
  }

};
