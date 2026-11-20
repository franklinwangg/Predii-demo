# Prompt 3 Gemma incorrect and missed predictions

Matched 100; 23 predictions were unmatched and 94 labels were missed. Matching was within each complaint, one-to-one, category-aware token Dice >= 0.50.

## Extraction failures

- **11608878:** Invalid offsets or no case/whitespace-normalized match for extracted text: "brakes don't work at all for a couple of seconds" (retry: Invalid offsets or no case/whitespace-normalized match for extracted text: "brakes don't work at all for a couple of seconds")

## Incorrect predictions (false positives)

### Complaint 11330515

- **Component:** <code>brakes</code>
- **Component:** <code>brakes</code>
- **Component:** <code>brakes</code>
- **Failure Mode:** <code>abs and brake lights are one</code>
- **Failure Mode:** <code>maintenance  required and srs airbag light</code>
- **Failure Mode:** <code>sometimes when tap on  the brakes they will lock up and you will go sliding sideways</code>

### Complaint 11396384

- **Component:** <code>friction brakes</code>

### Complaint 11406976

- **Failure Mode:** <code>car stopped accelerating/ engine died while driving at 20-30 mph exiting holland tunnel</code>
- **Failure Mode:** <code>red warning light on</code>

### Complaint 11432759

- **Failure Mode:** <code>smell an odor from the dust from the airbags</code>

### Complaint 11439482

- **Failure Mode:** <code>not knowing the speed, mileage, fuel level, or engine performance while driving</code>

### Complaint 11458514

- **Failure Mode:** <code>multiple lights came on (abs, vsc, &amp; brake)</code>
- **Failure Mode:** <code>warning lights went away and brakes were normal again</code>
- **Failure Mode:** <code>it took pumping of the brakes and full force on the pedal to bring it to a stop</code>

### Complaint 11479695

- **Component:** <code>fuel pump</code>
- **Failure Mode:** <code>gave a large red exclamation error sign on the dashboard</code>
- **Failure Mode:** <code>stopped accelerating and came to a stop</code>

### Complaint 11506504

- **Failure Mode:** <code>simply kept driving at around 20 miles per hour</code>

### Complaint 11509394

- **Failure Mode:** <code>the car jumps ahead, until they grab, then loose again immediately, with multiple lurches, and sometimes just no brakes at all available</code>

### Complaint 11547686

- **Failure Mode:** <code>airbag would be next impacted by this failure</code>

### Complaint 11648968

- **Component:** <code>brake actuator</code>
- **Component:** <code>brake actuator</code>

### Complaint 11698556

- **Component:** <code>left turn signal</code>

## Missed predictions (false negatives)

### Complaint 11316484

- **Component:** <code>fluid accumulator</code>
- **Component:** <code>faulty part</code>

### Complaint 11330515

- **Component:** <code>rear end</code>
- **Component:** <code>maintenance required</code>
- **Component:** <code>srs airbag light</code>
- **Component:** <code>master alarm buzzer</code>
- **Failure Mode:** <code>rim to overheat</code>
- **Failure Mode:** <code>they will lock up</code>
- **Failure Mode:** <code>go sliding sideways</code>
- **Failure Mode:** <code>brake actuator starts whining noise</code>

### Complaint 11353836

- **Component:** <code>dashboard</code>
- **Component:** <code>12v battery</code>
- **Component:** <code>brakes</code>

### Complaint 11396384

- **Component:** <code>pedal</code>
- **Failure Mode:** <code>buck</code>
- **Failure Mode:** <code>not stopping as effectively</code>

### Complaint 11398512

- **Component:** <code>gear</code>

### Complaint 11404857

- **Component:** <code>brake pedal</code>
- **Component:** <code>brake warning light</code>
- **Failure Mode:** <code>brake actuator needing to be replaced</code>

### Complaint 11406976

- **Component:** <code>engine</code>
- **Component:** <code>ac</code>
- **Component:** <code>red warning light</code>
- **Failure Mode:** <code>car stopped accelerating</code>
- **Failure Mode:** <code>engine died</code>

### Complaint 11414753

- **Component:** <code>actuator</code>
- **Component:** <code>abs</code>
- **Component:** <code>brake</code>
- **Component:** <code>vsc</code>

### Complaint 11432759

- **Component:** <code>breaks</code>
- **Component:** <code>front end</code>
- **Component:** <code>dashboard</code>
- **Component:** <code>airbags</code>
- **Failure Mode:** <code>could not stop</code>
- **Failure Mode:** <code>passenger side seatbelt did not</code>

### Complaint 11439482

- **Component:** <code>instrument panel</code>
- **Component:** <code>electrical functions</code>
- **Failure Mode:** <code>show any electrical functions</code>

### Complaint 11458514

- **Component:** <code>abs</code>
- **Component:** <code>vsc</code>
- **Component:** <code>brake</code>
- **Component:** <code>abs speed sensors</code>
- **Component:** <code>brake system</code>
- **Failure Mode:** <code>didn’t feel normal</code>
- **Failure Mode:** <code>a constant alarm started sounding</code>
- **Failure Mode:** <code>abs control module/actuator went bad</code>

### Complaint 11479695

- **Component:** <code>engine</code>
- **Component:** <code>dashboard</code>
- **Failure Mode:** <code>stopped accelerating</code>

### Complaint 11506504

- **Component:** <code>brake</code>

### Complaint 11509394

- **Component:** <code>antilock braking</code>
- **Component:** <code>front drive wheels</code>
- **Component:** <code>drive wheels</code>
- **Component:** <code>anti-lock brakes</code>
- **Component:** <code>brakes</code>
- **Failure Mode:** <code>front drive wheels loose traction</code>
- **Failure Mode:** <code>car jumps ahead</code>
- **Failure Mode:** <code>loose again immediately</code>
- **Failure Mode:** <code>multiple lurches</code>
- **Failure Mode:** <code>no brakes at all available</code>

### Complaint 11521924

- **Component:** <code>engine repair light</code>
- **Component:** <code>red triangle</code>
- **Failure Mode:** <code>engine repair light</code>

### Complaint 11547686

- **Component:** <code>flex cable</code>

### Complaint 11582441

- **Component:** <code>brake pedal</code>
- **Component:** <code>new part</code>
- **Failure Mode:** <code>most fail at 150k miles</code>

### Complaint 11593182

- **Component:** <code>brakes</code>
- **Failure Mode:** <code>minimal stoppage</code>

### Complaint 11596913

- **Component:** <code>brakes</code>
- **Component:** <code>parking brake</code>
- **Component:** <code>abs warning light</code>
- **Component:** <code>odometer</code>
- **Failure Mode:** <code>failed to display the correct mileage</code>

### Complaint 11608878

- **Component:** <code>brake actuator</code>
- **Component:** <code>brakes</code>
- **Component:** <code>abs</code>
- **Component:** <code>tpms light</code>
- **Failure Mode:** <code>brake actuator going bad</code>
- **Failure Mode:** <code>brakes are slow to work</code>
- **Failure Mode:** <code>sometimes don't work at all for a couple of seconds</code>
- **Failure Mode:** <code>abs and tpms light would briefly pop up</code>

### Complaint 11648968

- **Component:** <code>brake warning lights</code>
- **Component:** <code>braking system</code>
- **Component:** <code>module</code>

### Complaint 11658429

- **Component:** <code>driver-side airbag</code>
- **Component:** <code>airbag system</code>
- **Component:** <code>windshield</code>

### Complaint 11698502

- **Component:** <code>instrument cluster</code>

### Complaint 11698556

- **Component:** <code>computer</code>
- **Component:** <code>software</code>

### Complaint 11710245

- **Component:** <code>braking</code>

### Complaint 11718280

- **Component:** <code>engine</code>
- **Failure Mode:** <code>eingen faliur</code>
