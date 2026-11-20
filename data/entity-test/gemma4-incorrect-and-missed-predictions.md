# Gemma 4 incorrect and missed predictions

Compared Gemma 4 predictions with the 30 complaint labels. Matching used the existing one-to-one, category-aware token-Dice method (similarity >= 0.50). Totals: 95 matched, 37 incorrect/unmatched predictions, and 99 missed labels.

An incorrect prediction is an output entity that did not match a same-category ground-truth entity at the threshold; a missed prediction is a ground-truth entity left unmatched. These are metric mismatches, not necessarily hallucinations.

## Extraction failures

- **11396384:** The LLM returned a duplicate extraction. (retry: The LLM returned a duplicate extraction.)
- **11544891:** The LLM returned a duplicate extraction. (retry: The LLM returned a duplicate extraction.)

## Incorrect predictions (false positives)

### Complaint 11330515

- **Component:** <code>brakes</code>
- **Component:** <code>brakes</code>
- **Component:** <code>brakes</code>

### Complaint 11353836

- **Component:** <code>abs</code>

### Complaint 11384908

- **Failure Mode:** <code>intermittent</code>

### Complaint 11398512

- **Component:** <code>gear</code>

### Complaint 11406976

- **Component:** <code>car</code>
- **Component:** <code>car</code>

### Complaint 11414753

- **Component:** <code>brake</code>

### Complaint 11432759

- **Component:** <code>airbags</code>

### Complaint 11439482

- **Component:** <code>2005 toyota prius</code>

### Complaint 11457000

- **Failure Mode:** <code>inoperable</code>

### Complaint 11458514

- **Component:** <code>abs</code>
- **Component:** <code>abs</code>
- **Component:** <code>brake</code>
- **Component:** <code>brake</code>
- **Component:** <code>brake</code>

### Complaint 11479695

- **Component:** <code>fuel pump</code>
- **Failure Mode:** <code>stalled</code>
- **Failure Mode:** <code>gave a large red exclamation error sign</code>

### Complaint 11506504

- **Component:** <code>car</code>
- **Component:** <code>car</code>

### Complaint 11509394

- **Component:** <code>2005 prius</code>
- **Component:** <code>gen 3 prius</code>
- **Component:** <code>traction control</code>
- **Component:** <code>traction control</code>
- **Component:** <code>traction control</code>
- **Component:** <code>traction control</code>

### Complaint 11593182

- **Component:** <code>toyota hybrids</code>
- **Component:** <code>brakes</code>

### Complaint 11596913

- **Component:** <code>odometer</code>

### Complaint 11648968

- **Component:** <code>brake actuator</code>
- **Component:** <code>brake actuator</code>

### Complaint 11658429

- **Failure Mode:** <code>failed airbag information</code>

### Complaint 11698502

- **Component:** <code>2005 toyota prius</code>
- **Failure Mode:** <code>inoperable</code>

### Complaint 11698556

- **Component:** <code>left turn signal</code>

## Missed predictions (false negatives)

### Complaint 11316484

- **Component:** <code>fluid accumulator</code>
- **Component:** <code>faulty part</code>

### Complaint 11330515

- **Component:** <code>maintenance required</code>
- **Component:** <code>rim</code>
- **Component:** <code>brake fluid</code>
- **Failure Mode:** <code>the car won't stop</code>
- **Failure Mode:** <code>rear end makes noise and raises up</code>
- **Failure Mode:** <code>master alarm buzzer is on and won't go off</code>
- **Failure Mode:** <code>brakes engaged without hitting the brake</code>
- **Failure Mode:** <code>rim to overheat</code>
- **Failure Mode:** <code>brake fluid gets extremely hot</code>
- **Failure Mode:** <code>they will lock up</code>
- **Failure Mode:** <code>go sliding sideways</code>
- **Failure Mode:** <code>they straight to the floor</code>
- **Failure Mode:** <code>brake actuator starts whining noise</code>
- **Failure Mode:** <code>won't go off even if the car is turned off</code>

### Complaint 11353836

- **Component:** <code>dashboard</code>
- **Failure Mode:** <code>brakes became spongy</code>
- **Failure Mode:** <code>abs actuator had failed</code>
- **Failure Mode:** <code>destroying front brake pads and rotors</code>

### Complaint 11384908

- **Failure Mode:** <code>head light are intermittent</code>

### Complaint 11396384

- **Component:** <code>friction brakes</code>
- **Component:** <code>pedal</code>
- **Component:** <code>rear drum brakes</code>
- **Component:** <code>front disk brakes</code>
- **Failure Mode:** <code>friction brakes come in and lock up way too hard</code>
- **Failure Mode:** <code>car to skid</code>
- **Failure Mode:** <code>buck</code>
- **Failure Mode:** <code>not stopping as effectively</code>

### Complaint 11398512

- **Failure Mode:** <code>will not stay in the gear</code>
- **Failure Mode:** <code>car may sometimes stay in gear</code>

### Complaint 11404857

- **Failure Mode:** <code>brake warning light was illuminated</code>
- **Failure Mode:** <code>brake actuator needing to be replaced</code>

### Complaint 11406976

- **Failure Mode:** <code>car stopped accelerating</code>
- **Failure Mode:** <code>engine died</code>

### Complaint 11414753

- **Failure Mode:** <code>abs, brake, and vsc lights illuminated</code>

### Complaint 11432759

- **Component:** <code>breaks</code>
- **Component:** <code>dashboard</code>
- **Failure Mode:** <code>could not stop</code>
- **Failure Mode:** <code>passenger side seatbelt did not</code>

### Complaint 11439482

- **Component:** <code>electrical functions</code>
- **Failure Mode:** <code>instrument panel failed to light up</code>

### Complaint 11457000

- **Failure Mode:** <code>instrument panel was inoperable</code>

### Complaint 11458514

- **Failure Mode:** <code>brakes became hard to push</code>
- **Failure Mode:** <code>didn’t feel normal</code>
- **Failure Mode:** <code>a constant alarm started sounding</code>
- **Failure Mode:** <code>the vehicle was super hard to stop</code>
- **Failure Mode:** <code>abs control module/actuator went bad</code>

### Complaint 11479695

- **Component:** <code>engine</code>
- **Component:** <code>dashboard</code>
- **Failure Mode:** <code>vehicle stalled at low speeds</code>

### Complaint 11506504

- **Failure Mode:** <code>car eccellerated on its own</code>
- **Failure Mode:** <code>car did not respond</code>

### Complaint 11509394

- **Component:** <code>front drive wheels</code>
- **Component:** <code>drive wheels</code>
- **Component:** <code>brakes</code>
- **Failure Mode:** <code>front drive wheels loose traction</code>
- **Failure Mode:** <code>traction control immediately cuts all motive power to the drive wheels</code>
- **Failure Mode:** <code>it cuts in and out</code>
- **Failure Mode:** <code>brakes simply cut out</code>
- **Failure Mode:** <code>car jumps ahead</code>
- **Failure Mode:** <code>loose again immediately</code>
- **Failure Mode:** <code>multiple lurches</code>
- **Failure Mode:** <code>no brakes at all available</code>

### Complaint 11521924

- **Failure Mode:** <code>red triangle keeps coming on</code>
- **Failure Mode:** <code>engine repair light</code>

### Complaint 11544891

- **Component:** <code>toyota abs brake actuator</code>
- **Component:** <code>abs brake actuator</code>
- **Failure Mode:** <code>it is failing again</code>
- **Failure Mode:** <code>abs brake actuator fail</code>

### Complaint 11547686

- **Component:** <code>steering wheel</code>
- **Failure Mode:** <code>lost functionality for some buttons on the steering wheel</code>
- **Failure Mode:** <code>lines in the flex cable are impacted by corrosion</code>
- **Failure Mode:** <code>three have already failed</code>
- **Failure Mode:** <code>corroded line could fail during the vehicle's attempt to fire the airbag</code>

### Complaint 11582441

- **Component:** <code>brake pedal</code>
- **Component:** <code>new part</code>
- **Failure Mode:** <code>most fail at 150k miles</code>

### Complaint 11593182

- **Failure Mode:** <code>minimal stoppage</code>

### Complaint 11596913

- **Component:** <code>parking brake</code>
- **Component:** <code>abs warning light</code>
- **Failure Mode:** <code>failed to display the correct mileage</code>

### Complaint 11608878

- **Component:** <code>brakes</code>
- **Failure Mode:** <code>brake actuator going bad</code>
- **Failure Mode:** <code>abs and tpms light would briefly pop up</code>

### Complaint 11648968

- **Component:** <code>braking system</code>
- **Component:** <code>module</code>
- **Failure Mode:** <code>brake warning lights pop up</code>

### Complaint 11658429

- **Component:** <code>airbag system</code>
- **Component:** <code>windshield</code>
- **Failure Mode:** <code>airbag system might be defective</code>

### Complaint 11698502

- **Component:** <code>instrument cluster</code>
- **Failure Mode:** <code>turn signals were inoperable</code>

### Complaint 11698556

- **Component:** <code>four-way flashers</code>
- **Component:** <code>computer</code>
- **Component:** <code>software</code>

### Complaint 11710245

- **Component:** <code>braking</code>

### Complaint 11718280

- **Component:** <code>engine</code>
- **Failure Mode:** <code>engine faliure</code>
