# Regional muscle credit: evidence and implementation

Last reviewed: 2026-08-30

## What the percentages mean

The percentages in The Lab are **regional training-credit estimates within one broad-muscle set**, not measured force, EMG, or predicted hypertrophy. For example, a Bench Press set that earns 1.0 Chest set is allocated 25% upper, 60% mid, and 15% lower chest credit. It does not claim that 60% of the biological stimulus went to one region.

The exact biological contribution changes with anatomy, technique, range of motion, machine geometry, proximity to failure, and fatigue. Longitudinal hypertrophy evidence receives the most weight. Acute EMG and anatomy are supporting evidence only. Values are rounded in 5% increments so the interface does not imply unsupported precision.

## Evidence hierarchy used

1. Longitudinal resistance-training studies measuring regional muscle size by MRI or ultrasound.
2. Studies measuring individual-muscle hypertrophy after an exercise.
3. High-density or fine-wire EMG plus anatomy/biomechanics where training studies are missing.
4. Conservative equal allocation when evidence cannot distinguish regions reliably.

## Complete-library coverage and zero-load rule

The seeded library currently contains **104 exercises and 157 credited exercise–muscle pairs** after secondary muscles are included. Every one has an explicit regional profile. The development audit reports any future seed exercise or credited muscle that lacks one. The Exercise Library exposes each profile under **Regional focus**, so the complete assignment can be inspected without trusting a hidden default.

Zero external load is not specific to Hack Squat. Any normally weighted movement—including Back Squat, Front Squat, Bulgarian Split Squat, Walking Lunge, Goblet Squat, machines, an unloaded bar, and custom weighted exercises—switches its progress graph to reps when its newest session has no positive external load. Total and Best remain available. If a later session uses a positive load, estimated 1RM resumes; zero-load sets are never passed into the 1RM formula.

Machine geometry, stance, depth, torso angle, and foot placement can materially change joint moments. Because the log does not record all of those variables, the machine/squat percentages represent a neutral, typical execution rather than pretending every Hack Squat or Leg Press is identical.

## Biceps and elbow flexors — the important proof

The app tracks **biceps long head, biceps short head, brachialis, and brachioradialis**, but it does not claim that normal curls cleanly isolate one biceps head.

- Kassiano et al. randomized 63 women to preacher or incline curls. Incline curls produced a somewhat greater proximal elbow-flexor increase, while preacher curls produced a greater distal increase. This is evidence for *regional* differences along the arm, not proof that one variation isolates the long or short biceps head: [PubMed 39809454](https://pubmed.ncbi.nlm.nih.gov/39809454/).
- Zabaleta-Korta et al. found distal growth with preacher curls in a 9-week trial, while between-condition and between-region tests were not significant. This reinforces uncertainty rather than a head-isolation rule: [PubMed 37559762](https://pubmed.ncbi.nlm.nih.gov/37559762/).
- Pedrosa et al. found greater distal biceps hypertrophy when preacher curls trained the more lengthened/initial portion of elbow flexion: [PubMed 36828324](https://pubmed.ncbi.nlm.nih.gov/36828324/).
- A 2025 within-person trial matched preacher and Bayesian-cable resistance profiles and found similar biceps and brachialis hypertrophy across shoulder positions. That directly argues against assigning large long-head/short-head differences from shoulder angle alone: [PubMed 40082069](https://pubmed.ncbi.nlm.nih.gov/40082069/).
- Barbalho et al. compared cable and barbell preacher resistance profiles and found similar biceps hypertrophy despite different peak-torque positions: [PubMed 32823490](https://pubmed.ncbi.nlm.nih.gov/32823490/).
- Oliveira et al. measured long-head EMG across incline, preacher, and standard curls. Activation varied through the range of motion, but all variations substantially activated biceps and acute EMG is not a hypertrophy percentage: [PubMed 24150552](https://pubmed.ncbi.nlm.nih.gov/24150552/).
- Naito et al. directly examined long- and short-head activity during elbow flexion and supination, supporting the biceps’ shared elbow-flexion/supination roles rather than dependable isolation: [PubMed 7817389](https://pubmed.ncbi.nlm.nih.gov/7817389/).
- Pérot et al. measured relative long- and short-head contributions during isometric elbow tasks, again showing task-dependent coordination rather than an exercise giving exclusive head recruitment: [PubMed 20719658](https://pubmed.ncbi.nlm.nih.gov/20719658/).

Implementation consequence: supinated curls use a conservative 40/40 long-head/short-head split, with 15% brachialis and 5% brachioradialis. Neutral-grip/hammer curls shift credit toward brachialis and brachioradialis (20/20/35/25), but that split remains an estimate, not a measured growth prediction.

## Chest

- High-density EMG showed the excitation barycenter moving toward clavicular pectoralis at a 45-degree incline, while flat pressing concentrated the greatest amplitudes more sternocostally: [Cabral et al., PubMed 34644424](https://pubmed.ncbi.nlm.nih.gov/34644424/).
- A 10-week bench-press intervention measured MRI hypertrophy in pectoralis major, pectoralis minor, anterior deltoid, and triceps, with different magnitudes across muscles: [PubMed 39593465](https://pubmed.ncbi.nlm.nih.gov/39593465/).
- Push-ups and low-load bench press produced similar pectoralis and triceps hypertrophy when load was matched, supporting normal push-ups as real chest/triceps work: [PubMed 29541130](https://pubmed.ncbi.nlm.nih.gov/29541130/).
- A 24-week bench-press intervention found pectoralis growth and later triceps growth, supporting full primary chest and secondary triceps credit: [PubMed 24265879](https://pubmed.ncbi.nlm.nih.gov/24265879/).

Applied estimates: flat press/fly 25/60/15 upper/mid/lower; incline or low-to-high 50/40/10; dips or high-to-low 10/35/55.

## Triceps

- Maeo et al. used a within-person 12-week design and found substantially greater whole-triceps growth from overhead than neutral-arm cable extensions, particularly for the biarticular long head, despite lower absolute load: [PubMed 35819335 / DOI record](https://pubmed.ncbi.nlm.nih.gov/35819335/) and [journal article](https://doi.org/10.1080/17461391.2022.2100279).
- Bench pressing grows triceps but less than pectoralis in the cited MRI intervention: [PubMed 39593465](https://pubmed.ncbi.nlm.nih.gov/39593465/).

Applied estimates: overhead/skullcrusher 55/25/20 long/lateral/medial; pushdown 30/40/30; presses and dips 35/35/30. All three heads extend the elbow, so none receives zero.

## Deltoids

- Campos et al. compared anterior, medial, and posterior deltoid EMG in bench press, fly, shoulder press, and lateral raise. Shoulder press emphasized anterior deltoid; lateral raise and shoulder press were highest for medial deltoid; lateral raise also involved posterior deltoid: [PubMed 33312291](https://pubmed.ncbi.nlm.nih.gov/33312291/).
- An 8-week within-person trial found both cable and dumbbell lateral raises increased lateral-deltoid thickness similarly: [PubMed 40692697](https://pubmed.ncbi.nlm.nih.gov/40692697/).

Applied estimates: presses 65/30/5 front/side/rear; lateral raises 10/80/10; rear-delt/face-pull work 5/20/75.

## Quadriceps, glutes, adductors, and compound leg work

- Kubo et al. found full and half squats both increased knee-extensor volume, while full squats produced more gluteus maximus and adductor growth; rectus femoris and hamstrings did not significantly grow: [PubMed 31230110](https://pubmed.ncbi.nlm.nih.gov/31230110/).
- Kojic et al. found parallel squats increased all four quadriceps muscles without significant between-muscle differences: [PubMed 36498298](https://pubmed.ncbi.nlm.nih.gov/36498298/).
- A direct squat-versus-leg-extension trial found greater rectus-femoris hypertrophy from leg extension and greater distal vastus-lateralis hypertrophy from squats: [PubMed 41379528](https://pubmed.ncbi.nlm.nih.gov/41379528/).
- Plotkin et al. found squat and hip thrust produced similar gluteal hypertrophy, while squats produced more quadriceps and adductor growth; neither meaningfully grew hamstrings: [PubMed 37877099](https://pubmed.ncbi.nlm.nih.gov/37877099/).
- A 2026 within-person MRI trial measured 17 muscles after leg press versus leg extension. Leg press grew all three vasti, gluteus maximus, and adductor magnus, but did not meaningfully grow rectus femoris; leg extension produced much greater rectus-femoris growth: [PubMed 41630124](https://pubmed.ncbi.nlm.nih.gov/41630124/).
- Front- versus back-squat EMG found more vastus-medialis activity in front squats and more semitendinosus activity in back squats under maximal loading: [PubMed 25630691](https://pubmed.ncbi.nlm.nih.gov/25630691/).
- A Smith-squat versus leg-press study directly measured vastus-lateralis and vastus-medialis activation at multiple loads: [PubMed 30405437](https://pubmed.ncbi.nlm.nih.gov/30405437/).
- Fixed-path versus free-bar squats showed greater quadriceps and some phase-specific hamstring activity with the free path, supporting separate free/fixed profiles without treating either as a different anatomical exercise: [PubMed 36524056](https://pubmed.ncbi.nlm.nih.gov/36524056/).

Applied estimates are exercise-specific. Back/Goblet/Bodyweight Squat use 55% vasti, 10% rectus femoris, 25% glute max, and 10% adductors. Front Squat raises total quad credit to 75% and reduces glute/adductor credit. Machine Squat, Hack Squat, Smith Squat, and Leg Press use 70% quadriceps (22% VL, 22% VM, 18% VI, 8% RF), 20% glute max, and 10% adductors. Leg Extension uses 100% quadriceps and raises rectus-femoris credit to 30%. These are tracking allocations, not claims that the four machine movements are mechanically identical.

## Unilateral legs, lunges, step-ups, jumps, and isometrics

- A biomechanical study estimated forces in 11 muscles during squat, split squat, and step-up across four external loads. Glute max, glute medius, all three measured vasti, hamstrings, gastrocnemius, and soleus forces rose with load; split squats and step-ups often scaled glute/vasti/biceps-femoris forces more strongly than bilateral squats: [PubMed 32569122](https://pubmed.ncbi.nlm.nih.gov/32569122/).
- Bulgarian-split-squat EMG across four technique conditions showed that trunk flexion increased glute max, biceps femoris, and rectus femoris activation, demonstrating why one fixed percentage can only represent a neutral technique: [PubMed 40867012](https://pubmed.ncbi.nlm.nih.gov/40867012/).
- A direct comparison measured glute med/max, biceps femoris, VL, VM, and RF during single-leg squat, forward lunge, and lateral step-up: [PubMed 32236133](https://pubmed.ncbi.nlm.nih.gov/32236133/).
- Step-up research confirms meaningful glute medius recruitment and greater recruitment in lateral than forward variants: [PubMed 19778980](https://pubmed.ncbi.nlm.nih.gov/19778980/).

Applied estimates therefore separate Bulgarian Split Squat, lunges, and Step-Up rather than routing all three through the bilateral-squat profile. Step-Up receives the largest glute-med/min share; lunges receive slightly more hamstring credit; Bulgarian Split Squat sits between the bilateral squat and lunge profiles. Jump Squat, Box Jump, and Burpee use a power profile that also credits calves and hamstrings. Wall Sit uses a predominantly quadriceps isometric profile.

## Hamstrings and hinges

- Maeo et al. measured individual hamstring volumes by MRI. Seated curls produced more whole-hamstring and biarticular-hamstring growth than prone curls, while the monoarticular biceps-femoris short head response was similar: [PubMed 33009197](https://pubmed.ncbi.nlm.nih.gov/33009197/).
- In a 10-week prone-curl study, ankle position did not alter biceps-femoris-long-head hypertrophy: [PubMed 37194431](https://pubmed.ncbi.nlm.nih.gov/37194431/).
- An EMG comparison of Romanian/step-Romanian/stiff-leg deadlifts showed exercise-dependent differences across glute max, semitendinosus, and erector-spinae regions: [PubMed 35162922](https://pubmed.ncbi.nlm.nih.gov/35162922/).

Applied estimates: curls divide credit among biceps femoris long/short, semitendinosus, and semimembranosus. Hip hinges emphasize the three biarticular hamstrings plus glute max; the short head receives no hinge credit because it does not cross the hip.

## Calves

- A 12-week within-person MRI study found standing calf raises produced much greater medial and lateral gastrocnemius growth than seated raises, while soleus growth was similar: [PubMed 38156065](https://pubmed.ncbi.nlm.nih.gov/38156065/).
- Foot-angle training produced portion-specific gastrocnemius changes, but the app does not know a user’s toe angle and therefore does not guess it: [PubMed 32735428](https://pubmed.ncbi.nlm.nih.gov/32735428/).

Applied estimates: standing 35/35/30 medial-gastroc/lateral-gastroc/soleus; seated 15/15/70.

## Back

Regional back hypertrophy trials are sparse, so these allocations are lower-confidence and lean more on movement function plus EMG.

- Pull-up variations substantially recruited latissimus, biceps, posterior deltoid, and middle trapezius, with few differences between variations: [PubMed 28828073](https://pubmed.ncbi.nlm.nih.gov/28828073/).
- Pronated, supinated, neutral, and rope pull-ups produced broadly similar shoulder-arm activation, with some middle-trapezius differences: [PubMed 28011412](https://pubmed.ncbi.nlm.nih.gov/28011412/).
- Lat-pulldown variants recruit latissimus, posterior deltoid, biceps, and trapezius rather than an isolated “lat-only” pattern: [PubMed 19855327](https://pubmed.ncbi.nlm.nih.gov/19855327/).
- Row variations recruit middle trapezius, latissimus, and posterior deltoid; higher rows increase trapezius/posterior-delt emphasis: [PubMed 32940548](https://pubmed.ncbi.nlm.nih.gov/32940548/).
- Fine-wire EMG confirms rows recruit both middle trapezius and rhomboid major: [PubMed 27504044](https://pubmed.ncbi.nlm.nih.gov/27504044/).

Applied estimates: vertical pulls 65% lats, 20% mid/lower traps-rhomboids, 5% upper traps, 10% spinal erectors; rows 40/45/10/5; shrugs 85% upper traps; deadlift/back-extension patterns 70% spinal erectors within their credited Back set.

## Abs and “lower abs”

Upper and lower rectus are regions of one rectus-abdominis muscle, not independently isolatable muscles.

- A 2006 EMG study found no exercise-specific activation differences among four rectus-abdominis quadrants: [PubMed 16558218](https://pubmed.ncbi.nlm.nih.gov/16558218/).
- A newer ultrasound/EMG study found preferential activation nearer the applied load across crunches, sit-ups, and leg raises, but all rectus segments shortened in all exercises: [PubMed 38288259](https://pubmed.ncbi.nlm.nih.gov/38288259/).
- A sit-up/leg-raise comparison also measured both upper and lower rectus plus hip flexors, illustrating why leg raises cannot be treated as isolated lower-rectus work: [PubMed 27065536](https://pubmed.ncbi.nlm.nih.gov/27065536/).

Applied estimates: “Lower rectus” is included as a useful regional label, but never receives 100%. Leg/knee raises use 40% lower, 25% upper, 15% oblique, 20% deep-core credit. Crunch patterns use 40% upper, 30% lower, 15% oblique, 15% deep core. The interface explicitly calls these estimates.

## Custom-exercise assessment and maintenance rule

Every seeded exercise must resolve to regional credits summing to 100% for every broad muscle it receives. A custom exercise does **not** silently receive a detailed profile from its name alone. The user must confirm the closest included movement or explicitly choose “Not sure — broad muscle only.”

- A confirmed match copies the included movement's researched allocation only for broad muscles that the reference actually credits. A newly selected muscle with no matching source remains `General`.
- “Adjust regional focus” lets the user alter that copied estimate. Its sliders rebalance the other regions so each broad-muscle allocation always remains 100%.
- Saved provenance distinguishes `research-copy`, `user-set`, and `unspecified` custom profiles. This prevents a personal estimate from later being presented as a curated research value.
- Existing custom exercises keep their saved percentages and can be reassessed in the same editor. Legacy entries without provenance receive a suggested closest movement when possible and can be corrected or set to broad-only.

If higher-quality longitudinal evidence conflicts with a curated model, update the resolver, increment `libraryV`, and record the source and rationale here. User-set custom profiles must not be overwritten by a library refresh.

## Legacy custom-exercise audit (2026-08-30)

A private production audit found 38 legacy custom-exercise records created before regional assessment existed. Exact aliases of included exercises reuse their included profiles. Six distinct templates required additional estimates:

- **Cable front raise:** 85% front, 10% side, 5% rear deltoid. A direct comparison found frontal raises preferentially excited anterior deltoid, while neutral lateral raises preferentially excited medial deltoid: [PubMed 32824894](https://pubmed.ncbi.nlm.nih.gov/32824894/).
- **Chest-supported row:** 45% lats, 50% mid/lower traps and rhomboids, 5% upper traps. Chest support removes meaningful erector loading; row studies consistently measure substantial lat and middle-trapezius/rhomboid recruitment: [PubMed 15228624](https://pubmed.ncbi.nlm.nih.gov/15228624/), [PubMed 27504044](https://pubmed.ncbi.nlm.nih.gov/27504044/), and a newer high-density row comparison [PubMed 41562724](https://pubmed.ncbi.nlm.nih.gov/41562724/).
- **Wide row:** 30% lats, 55% mid/lower traps and rhomboids, 10% upper traps, 5% erectors. This is deliberately only moderately different from the normal row profile because exercise technique changes activation more than the name alone establishes; rowing evidence supports both lat and scapular-retractor involvement: [PubMed 15228624](https://pubmed.ncbi.nlm.nih.gov/15228624/) and [PubMed 39177899](https://pubmed.ncbi.nlm.nih.gov/39177899/).
- **Straight-arm pulldown:** 80% lats, 15% mid/lower traps and rhomboids, 5% erectors. This is a shoulder-extension estimate with no biceps credit. Pullover/pulldown research confirms strong position-dependent lat involvement but also shows that superficially similar free-weight pullovers can emphasize pectoralis, so this template is not reused for dumbbell/barbell pullovers: [PubMed 35992501](https://pubmed.ncbi.nlm.nih.gov/35992501/) and [PubMed 21975179](https://pubmed.ncbi.nlm.nih.gov/21975179/).
- **Reverse curl:** 15% long-head biceps, 15% short-head biceps, 35% brachialis, 35% brachioradialis. This is a conservative tracking allocation, not a measured hypertrophy ratio. Pronated elbow flexion reduces biceps contribution, but available acute studies do not justify claiming isolated brachioradialis growth: [PubMed 36976950](https://pubmed.ncbi.nlm.nih.gov/36976950/) and [PubMed 10328159](https://pubmed.ncbi.nlm.nih.gov/10328159/).
- **Lateral band walk:** 75% glute med/min, 25% glute max. Bilateral EMG shows materially greater gluteus-medius than gluteus-maximus activation, while band placement and stance change the exact response: [PubMed 22845002](https://pubmed.ncbi.nlm.nih.gov/22845002/) and [PubMed 30615490](https://pubmed.ncbi.nlm.nih.gov/30615490/).

Unilateral leg press retains the machine-leg-press profile. Research finds no overall activation difference sufficient to justify different regional percentages solely because one rather than two legs is used: [PubMed 34389058](https://pubmed.ncbi.nlm.nih.gov/34389058/). Neutral-grip pulldown variants retain the vertical-pull profile because a trained-subject comparison found no significant back-muscle activation differences across seven grip/trunk variants: [PubMed 40981044](https://pubmed.ncbi.nlm.nih.gov/40981044/).

Three user-created gym labels could only be inferred from their assigned broad muscle and logging context; they are saved as **low confidence** so the owner can correct them. One unused exercise whose name specifies equipment but no movement remains `General` instead of receiving invented sub-muscle percentages. Account names and private exercise-name mappings are intentionally not stored in this public repository.
