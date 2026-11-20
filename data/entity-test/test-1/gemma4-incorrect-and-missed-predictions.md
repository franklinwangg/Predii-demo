# Error analysis

Failed complaints: 5. TP/FP/FN matching uses category-aware token Dice >= 0.50.

## Category mismatches (8)
- 11330515: predicted [Failure Mode] "ABS AND BRAKE LIGHTS ARE ONE"; ground truth [Component] "brake lights" (token Dice 0.50)
- 11330515: predicted [Failure Mode] "MAINTENANCE  REQUIRED AND SRS AIRBAG LIGHT"; ground truth [Component] "srs airbag light" (token Dice 0.67)
- 11406976: predicted [Failure Mode] "RED WARNING LIGHT ON"; ground truth [Component] "red warning light" (token Dice 0.86)
- 11406976: predicted [Failure Mode] "AC WARNING LIGHT"; ground truth [Component] "red warning light" (token Dice 0.67)
- 11509394: predicted [Failure Mode] "traction control kicks in"; ground truth [Component] "traction control systems" (token Dice 0.57)
- 11648968: predicted [Component] "brake actuator"; ground truth [Failure Mode] "brake actuator fail" (token Dice 0.80)
- 11648968: predicted [Component] "brake actuator"; ground truth [Failure Mode] "brake actuator fail" (token Dice 0.80)
- 11698556: predicted [Component] "left turn signal"; ground truth [Failure Mode] "left turn signal failed to function as intended" (token Dice 0.55)

## Incorrect or unmatched predictions (22)
- 11330515: [Component] "BRAKES" (confidence 10)
- 11330515: [Component] "BRAKES" (confidence 10)
- 11330515: [Component] "BRAKES" (confidence 10)
- 11396384: [Component] "FRICTION BRAKES" (confidence 10)
- 11406976: [Failure Mode] "CAR STOPPED ACCELERATING/ ENGINE DIED WHILE DRIVING AT 20-30 MPH EXITING HOLLAND TUNNEL" (confidence 10)
- 11406976: [Failure Mode] "RESUMED ACCELERATING" (confidence 10)
- 11506504: [Failure Mode] "simply kept driving at around 20 miles per hour" (confidence 10)
- 11509394: [Component] "traction control" (confidence 10)
- 11509394: [Component] "traction control" (confidence 10)
- 11509394: [Component] "traction control" (confidence 10)
- 11509394: [Failure Mode] "the car jumps ahead, until they grab, then loose again immediately, with multiple lurches" (confidence 10)
- 11547686: [Component] "airbag" (confidence 10)
- 11547686: [Component] "airbag" (confidence 10)
- 11547686: [Component] "airbag" (confidence 10)
- 11593182: [Component] "brakes" (confidence 10)
- 11658429: [Failure Mode] "severe cognitive symptoms" (confidence 10)
- 11658429: [Failure Mode] "confusion" (confidence 10)
- 11658429: [Failure Mode] "chronic fatigue" (confidence 10)
- 11658429: [Failure Mode] "sudden drowsiness" (confidence 10)
- 11658429: [Failure Mode] "memory loss" (confidence 10)
- 11658429: [Failure Mode] "extreme mood swings" (confidence 10)
- 11710245: [Failure Mode] "Had to swerve to avoid collision on interstate" (confidence 10)

## Missed entities (98)
- 11316484: [Component] "faulty part"
- 11330515: [Component] "rear end"
- 11330515: [Component] "rim"
- 11330515: [Failure Mode] "rim to overheat"
- 11330515: [Failure Mode] "go sliding sideways"
- 11353836: [Component] "abs"
- 11353836: [Component] "brake lights"
- 11353836: [Component] "dashboard"
- 11353836: [Component] "12v battery"
- 11353836: [Component] "brake fluid"
- 11353836: [Component] "brakes"
- 11353836: [Component] "abs actuator"
- 11353836: [Component] "front brake pads"
- 11353836: [Component] "rotors"
- 11353836: [Failure Mode] "brakes became spongy"
- 11353836: [Failure Mode] "abs actuator had failed"
- 11353836: [Failure Mode] "destroying front brake pads and rotors"
- 11396384: [Component] "pedal"
- 11396384: [Failure Mode] "buck"
- 11396384: [Failure Mode] "not stopping as effectively"
- 11398512: [Component] "gear"
- 11404857: [Component] "brake pedal"
- 11406976: [Component] "engine"
- 11406976: [Failure Mode] "car stopped accelerating"
- 11406976: [Failure Mode] "engine died"
- 11414753: [Component] "actuator"
- 11414753: [Component] "abs"
- 11414753: [Component] "brake"
- 11414753: [Component] "vsc"
- 11432759: [Component] "breaks"
- 11432759: [Component] "front end"
- 11432759: [Component] "driver side seatbelt"
- 11432759: [Component] "passenger side seatbelt"
- 11432759: [Component] "dashboard"
- 11432759: [Component] "airbags"
- 11432759: [Failure Mode] "passenger side seatbelt did not"
- 11439482: [Component] "instrument panel"
- 11439482: [Component] "electrical functions"
- 11439482: [Failure Mode] "instrument panel failed to light up"
- 11439482: [Failure Mode] "show any electrical functions"

## Matched but non-identical spans (25)
- 11330515: predicted [Failure Mode] "CAR WON'T STOP"; matched [Failure Mode] "the car won't stop" (token Dice 0.89)
- 11330515: predicted [Failure Mode] "TAP THE BRAKES AND THEY STRAIGHT TO THE FLOOR"; matched [Failure Mode] "they straight to the floor" (token Dice 0.77)
- 11330515: predicted [Failure Mode] "BRAKE ACTUATOR STARTS WHINING NOISE AND WON'T GO OFF EVEN IF THE CAR IS TURNED OFF"; matched [Failure Mode] "won't go off even if the car is turned off" (token Dice 0.77)
- 11330515: predicted [Failure Mode] "BRAKES ENGAGED WITHOUT HITTING THE BRAKE CAUSES RIM TO OVERHEAT"; matched [Failure Mode] "brakes engaged without hitting the brake" (token Dice 0.75)
- 11330515: predicted [Failure Mode] "SOMETIMES WHEN TAP ON  THE BRAKES THEY WILL LOCK UP"; matched [Failure Mode] "they will lock up" (token Dice 0.57)
- 11396384: predicted [Failure Mode] "THE CAR TO SKID AND/OR BUCK"; matched [Failure Mode] "car to skid" (token Dice 0.60)
- 11398512: predicted [Failure Mode] "STARTS TO WARM UP THEN THE CAR MAY SOMETIMES STAY IN GEAR"; matched [Failure Mode] "car may sometimes stay in gear" (token Dice 0.67)
- 11404857: predicted [Component] "BRAKE ACTUATOR NEEDING TO BE REPLACED"; matched [Component] "brake actuator" (token Dice 0.50)
- 11414753: predicted [Component] "ACTUATOR ON MY BRAKE SYSTEM"; matched [Component] "brake system" (token Dice 0.57)
- 11506504: predicted [Failure Mode] "eccellerated on its own"; matched [Failure Mode] "car eccellerated on its own" (token Dice 0.89)
- 11506504: predicted [Failure Mode] "the car did not respond"; matched [Failure Mode] "car did not respond" (token Dice 0.89)
- 11509394: predicted [Failure Mode] "sometimes just no brakes at all available"; matched [Failure Mode] "no brakes at all available" (token Dice 0.83)
- 11509394: predicted [Component] "traction control"; matched [Component] "traction control systems" (token Dice 0.80)
- 11509394: predicted [Failure Mode] "the anti-lock system initiates, the brakes simply cut out"; matched [Failure Mode] "brakes simply cut out" (token Dice 0.62)
- 11509394: predicted [Failure Mode] "it cuts in and out until the car decides it has enough traction to proceed"; matched [Failure Mode] "it cuts in and out" (token Dice 0.53)
- 11509394: predicted [Component] "antilock braking and traction control systems"; matched [Component] "antilock braking" (token Dice 0.50)
- 11521924: predicted [Failure Mode] "red triangle keeps coming on with engine repair light"; matched [Failure Mode] "red triangle keeps coming on" (token Dice 0.71)
- 11544891: predicted [Component] "abs brake actuator"; matched [Component] "toyota abs brake actuator" (token Dice 0.86)
- 11547686: predicted [Component] "clockspring mechanism inside the whweel"; matched [Component] "clockspring mechanism" (token Dice 0.57)
- 11582441: predicted [Failure Mode] "SOFT brake pedal"; matched [Failure Mode] "defaulting to soft brake pedal" (token Dice 0.75)
- 11593182: predicted [Failure Mode] "brakes sometimes is floored to the ground with minimal stoppage"; matched [Failure Mode] "brakes sometimes is floored to the ground" (token Dice 0.82)
- 11658429: predicted [Component] "airbag system failed"; matched [Component] "airbag system" (token Dice 0.80)
- 11658429: predicted [Component] "driver-side airbag failed to deploy"; matched [Component] "driver-side airbag" (token Dice 0.67)
- 11698556: predicted [Component] "computer failure"; matched [Component] "computer" (token Dice 0.67)
- 11718280: predicted [Component] "engine faliure"; matched [Component] "engine" (token Dice 0.67)
