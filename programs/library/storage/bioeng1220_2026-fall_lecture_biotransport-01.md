Title: Biotransport Foundations and Flow Rates
Description: Conservation laws, control volumes, and the volumetric flow-rate integral.
Kind: fieldnote
Subject: BIOENG
Catalog: 1220
Semester: Fall 2026
------------------------------

## Overview

Biotransport studies how mass, momentum, and energy move through tissue and fluid. Every problem in the field runs the same chain: a conservation law paired with a constitutive equation, then solved and interpreted. The control volume is the bookkeeping device that makes that chain work at any point in a flow.

## Three quantities, one chain

A **conservation law** is universal, so it cannot tell water from honey from blood. Closing that gap takes a **constitutive equation**, which is measured rather than derived, and describes how one particular material resists deformation.

```mermaid
flowchart LR
  C[Conservation law] --> K[Constitutive equation]
  K --> M[Math and solve]
  M --> I[Interpret and predict]
```

Fig. 01 — the chain from conservation law to prediction.

==Neither box works alone: the law generates the equation, the constitutive relation closes it.== Every transported quantity gets its own pairing, and the structure repeats all term.

| Transported | Conservation law | Constitutive equation |
|---|---|---|
| Bulk mass | continuity | none needed |
| Momentum | Newton's second law | Newton's law of viscosity |
| One chemical species | species conservation | Fick's law |
| Energy | first law of thermodynamics | Fourier's law |

## Continuous deformation defines a fluid

A solid pushed sideways deforms a finite amount and then stops. A fluid under the same push never stops deforming, which is why its stress law involves a rate rather than an amount.

```svg
<svg viewBox="0 0 640 200" role="img" aria-label="A solid element shears to a fixed angle and holds there, while a fluid element under the same force keeps shearing without limit">
  <style>
    .dfm-n{font:600 12px "IBM Plex Sans",sans-serif;fill:#1B1720}
    .dfm-c{font:11px "IBM Plex Sans",sans-serif;fill:#6E6577}
    .dfm-sol{transform-box:fill-box;transform-origin:50% 100%;animation:dfm-stop 6s ease-out infinite}
    .dfm-flu{transform-box:fill-box;transform-origin:50% 100%;animation:dfm-go 6s linear infinite}
    @keyframes dfm-stop{0%{transform:skewX(0deg)}18%,100%{transform:skewX(-16deg)}}
    @keyframes dfm-go{0%{transform:skewX(0deg)}100%{transform:skewX(-40deg)}}
    @media (prefers-reduced-motion:reduce){
      .dfm-sol{animation:none;transform:skewX(-16deg)}
      .dfm-flu{animation:none;transform:skewX(-40deg)}}
  </style>
  <line x1="20" y1="130" x2="300" y2="130" stroke="#E4DEE6" stroke-width="2"/>
  <line x1="340" y1="130" x2="620" y2="130" stroke="#E4DEE6" stroke-width="2"/>
  <text class="dfm-c" x="20" y="32">same sideways force applied to both</text>
  <text class="dfm-n" x="155" y="158" text-anchor="middle">solid</text>
  <text class="dfm-c" x="155" y="176" text-anchor="middle">deforms, then stops</text>
  <text class="dfm-n" x="475" y="158" text-anchor="middle">fluid</text>
  <text class="dfm-c" x="475" y="176" text-anchor="middle">never stops deforming</text>
  <rect class="dfm-sol" x="110" y="70" width="90" height="60" rx="3" fill="none" stroke="#4C3A7A" stroke-width="1.5"/>
  <rect class="dfm-flu" x="430" y="70" width="90" height="60" rx="3" fill="none" stroke="#C9556F" stroke-width="1.5"/>
</svg>
```

Fig. 02 — a solid shears to a fixed angle and stops; a fluid never stops.

That single word, *continuously*, is what forces a velocity gradient into Newton's law of viscosity. Liquids also barely change density under pressure, so **incompressible** with constant density is the standing assumption.

## Convection races, diffusion crawls

**Convection** is transport by bulk fluid motion in response to external force. **Diffusion** is spread by random molecular motion and needs no bulk motion at all. Their reach scales differently with time, and that difference sets the architecture of the body.

$$
\begin{aligned}
x_{\text{diff}} &\sim \sqrt{2Dt} \\
x_{\text{conv}} &= \langle v \rangle\, t
\end{aligned}
$$

| Symbol | Meaning (units) |
|---|---|
| $x_{\text{diff}}$ | distance spread by diffusion (m) |
| $x_{\text{conv}}$ | distance carried by bulk flow (m) |
| $D$ | diffusion coefficient (m² s⁻¹) |
| $\langle v \rangle$ | average fluid velocity (m s⁻¹) |
| $t$ | elapsed time (s) |

```chart
{
  "type": "line",
  "data": {
    "labels": ["1", "10", "100", "1000"],
    "datasets": [
      { "label": "Diffusion", "data": [45, 141, 447, 1414],
        "borderColor": "#4C3A7A", "tension": 0 },
      { "label": "Convection at 0.5 mm/s", "data": [500, 5000, 50000, 500000],
        "borderColor": "#C9556F", "borderDash": [5, 4], "tension": 0 }
    ]
  },
  "options": {
    "scales": {
      "x": { "title": { "display": true, "text": "time (s)" } },
      "y": { "type": "logarithmic",
             "title": { "display": true, "text": "distance travelled (µm)" } }
    }
  }
}
```

Fig. 03 — diffusive and convective reach against time, log scale.

==Diffusion is excellent over micrometres and hopeless over centimetres.== A circulatory system exists to convect blood the long distance so diffusion only has to cover the last hundred micrometres to a cell.

## Where disturbed flow does damage

Arterial lesions appear at branches and curves, not along straight segments. Cells lining the wall read the local shear and turn inflammatory wherever it is low or reverses with each heartbeat.

| Site | Flow character | Lesion risk |
|---|---|---|
| Straight segment | steady, unidirectional | low |
| Outer wall of a curve | separated, low shear | high |
| Branch point | recirculating, oscillatory | high |

Because the pattern follows geometry, it can be computed from a vessel scan before any disease appears. A spherical drug implant shows the same steepness in reverse: concentration falls as $1/r$, so five radii out only a fifth remains.

## The box that becomes a point

A **control volume** is a region fixed in space that fluid passes through. You watch a location rather than follow a parcel, and that is what lets you write a balance for the location itself.

```svg
<svg viewBox="0 0 640 200" role="img" aria-label="A finite control volume shrinks down to a single point within a flow field, yielding equations that hold at every location">
  <style>
    .cvs-c{font:11px "IBM Plex Sans",sans-serif;fill:#6E6577}
    .cvs-box{transform-box:fill-box;transform-origin:50% 50%;animation:cvs-shrink 5s ease-in-out infinite}
    .cvs-dot{opacity:0;animation:cvs-appear 5s ease-in-out infinite}
    @keyframes cvs-shrink{0%,10%{transform:scale(1)}70%,100%{transform:scale(.10)}}
    @keyframes cvs-appear{0%,60%{opacity:0}78%,100%{opacity:1}}
    @media (prefers-reduced-motion:reduce){
      .cvs-box{animation:none;transform:scale(.10)}
      .cvs-dot{animation:none;opacity:1}}
  </style>
  <path d="M20 46 C 200 38, 440 54, 620 46" fill="none" stroke="#E4DEE6" stroke-width="2"/>
  <path d="M20 74 C 200 68, 440 82, 620 74" fill="none" stroke="#E4DEE6" stroke-width="2"/>
  <path d="M20 126 C 200 120, 440 134, 620 126" fill="none" stroke="#E4DEE6" stroke-width="2"/>
  <path d="M20 154 C 200 148, 440 162, 620 154" fill="none" stroke="#E4DEE6" stroke-width="2"/>
  <text class="cvs-c" x="24" y="26">flow field</text>
  <text class="cvs-c" x="320" y="182" text-anchor="middle">shrink the control volume to a point</text>
  <rect class="cvs-box" x="250" y="56" width="140" height="88" rx="3" fill="none" stroke="#4C3A7A" stroke-width="1.5"/>
  <circle class="cvs-dot" cx="320" cy="100" r="5" fill="#C9556F"/>
</svg>
```

Fig. 04 — shrinking the control volume until it becomes a point.

A finite box gives inlet-versus-outlet totals and no interior detail. Shrinking it produces differential equations that yield velocity and stress at every point in the flow field.

## Only the normal component crosses

Each face of the box carries an outward unit normal. Only the velocity component along that normal actually passes through the face, which is the entire reason the flow-rate integral contains a dot product.

```svg
<svg viewBox="0 0 640 200" role="img" aria-label="A fluid particle moving perpendicular to a control volume face passes through it, while a particle moving parallel to the face never crosses">
  <style>
    .nrm-n{font:600 12px "IBM Plex Sans",sans-serif;fill:#1B1720}
    .nrm-c{font:11px "IBM Plex Sans",sans-serif;fill:#6E6577}
    .nrm-in{animation:nrm-cross 4.5s ease-in-out infinite}
    .nrm-by{animation:nrm-slide 4.5s ease-in-out infinite}
    @keyframes nrm-cross{0%{transform:translate(0,0);opacity:0}
      8%{opacity:1}80%{transform:translate(330px,0);opacity:1}
      92%,100%{transform:translate(330px,0);opacity:0}}
    @keyframes nrm-slide{0%{transform:translate(0,0);opacity:0}
      8%{opacity:1}80%{transform:translate(0,-96px);opacity:1}
      92%,100%{transform:translate(0,-96px);opacity:0}}
    @media (prefers-reduced-motion:reduce){
      .nrm-in{animation:none;transform:translate(330px,0);opacity:1}
      .nrm-by{animation:none;transform:translate(0,-96px);opacity:1}}
  </style>
  <line x1="430" y1="34" x2="430" y2="168" stroke="#E4DEE6" stroke-width="2"/>
  <path d="M430 56 H 484" fill="none" stroke="#6E6577" stroke-width="1.5" marker-end="url(#nrm-ar)"/>
  <text class="nrm-n" x="430" y="24" text-anchor="middle">CV face</text>
  <text class="nrm-c" x="496" y="60">n</text>
  <text class="nrm-c" x="120" y="128" text-anchor="middle">crosses, counts</text>
  <text class="nrm-c" x="300" y="182" text-anchor="middle">parallel, contributes nothing</text>
  <circle class="nrm-in" cx="120" cy="104" r="9" fill="#C9556F"/>
  <circle class="nrm-by" cx="300" cy="158" r="9" fill="#6E6577"/>
  <defs>
    <marker id="nrm-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M0 0 L10 5 L0 10 z" fill="#6E6577"/>
    </marker>
  </defs>
</svg>
```

Fig. 05 — only the velocity component along the normal crosses the face.

$$\dot{Q} = \int_A \vec{v} \cdot \vec{n}\; dA$$

| Symbol | Meaning (units) |
|---|---|
| $\dot{Q}$ | volumetric flow rate, a scalar (m³ s⁻¹) |
| $\vec{v}$ | fluid velocity at the face (m s⁻¹) |
| $\vec{n}$ | outward unit normal, magnitude one (dimensionless) |
| $A$ | area of the face (m²) |

With the normal pointing outward, a positive result means fluid leaving and a negative one means fluid entering, so a single integral handles both directions.

$$\dot{M} = \rho \dot{Q}$$

where $\rho$ is the fluid density in kg m⁻³.

> Exam trap: in compressible flow $\dot{M}$ is conserved and $\dot{Q}$ is not. Mass is the conserved quantity; the same mass simply occupies a different volume.

## Half of the centreline maximum

Velocity is rarely uniform across a face, which is why $\dot{Q}$ is an integral rather than a product. For steady flow in a round vessel the profile is parabolic and the integral has an answer worth memorising.

```svg
<svg viewBox="0 0 640 210" role="img" aria-label="A parabolic velocity profile across a vessel, with the average velocity marked at exactly half the centreline maximum">
  <style>
    .par-c{font:11px "IBM Plex Sans",sans-serif;fill:#6E6577}
    .par-k{font:italic 12px "IBM Plex Serif",serif;fill:#4C3A7A}
    .par-h{font:italic 12px "IBM Plex Serif",serif;fill:#C9556F}
    .par-curve{stroke-dasharray:100;stroke-dashoffset:100;animation:par-draw 3.5s ease-out infinite}
    @keyframes par-draw{0%{stroke-dashoffset:100}70%,100%{stroke-dashoffset:0}}
    @media (prefers-reduced-motion:reduce){.par-curve{animation:none;stroke-dashoffset:0}}
  </style>
  <line x1="70" y1="40" x2="600" y2="40" stroke="#E4DEE6" stroke-width="2"/>
  <line x1="70" y1="170" x2="600" y2="170" stroke="#E4DEE6" stroke-width="2"/>
  <line x1="180" y1="40" x2="180" y2="170" stroke="#C9556F" stroke-width="1.5" stroke-dasharray="5 4"/>
  <path d="M92 60 H 176" fill="none" stroke="#6E6577" stroke-width="1" marker-end="url(#par-ar)"/>
  <path d="M92 105 H 262" fill="none" stroke="#6E6577" stroke-width="1" marker-end="url(#par-ar)"/>
  <path d="M92 150 H 176" fill="none" stroke="#6E6577" stroke-width="1" marker-end="url(#par-ar)"/>
  <text class="par-h" x="184" y="28">average is half of max</text>
  <text class="par-k" x="286" y="109">vmax</text>
  <text class="par-c" x="70" y="192">vessel wall, no slip at either edge</text>
  <path class="par-curve" d="M90 40 Q450 105 90 170" pathLength="100"
        fill="none" stroke="#4C3A7A" stroke-width="2.5"/>
  <defs>
    <marker id="par-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M0 0 L10 5 L0 10 z" fill="#6E6577"/>
    </marker>
  </defs>
</svg>
```

Fig. 06 — a parabolic profile, with the average at half the centreline maximum.

Using the centreline value in place of the average therefore ~~gives the same flow rate~~ overstates it by a factor of two.

## What changes if

| Change | What follows |
|---|---|
| Density varies with pressure | $\dot{M}$ conserved, $\dot{Q}$ is not |
| Velocity turns parallel to a face | that face contributes nothing |
| Control volume shrinks to zero | integral balance becomes differential |
| Vessel branches or curves | shear drops, lesion risk rises |

## The checks

- [ ] State why a conservation law alone cannot give a velocity profile
- [ ] Derive the average velocity of a parabolic profile from the flow-rate integral
- [ ] Predict what happens to $\dot{Q}$ when velocity turns parallel to a face
