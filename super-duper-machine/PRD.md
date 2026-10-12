
tech stack
i wanna make another simple site project like the nutrition label, use vite (lighter than next.js i guess) and hopefully host on coolify

device
this is supposed to be a playtesting use game and more ideally it is an android/ios app, which allows more supported sensor enabling, which is the core feature sort of

what does it do
1. when you land on the site, you see a graphic "super duper machine" (in media dir), the background is the background.png, on desktop maybe use the windows-wallpaper
2. and then there are "tree" at the center, and when you click on tree, you see an "apple" pop up
3. when you click on the "apple", you can see a pop up, says "your first super duper machine"
4. and here are the function part:
   a. the first is the preset where you have already done the "blocks" setup
   b. what it does is the user can drop the phone from at least 1 meters away from a surface (tell them on the pop up)
   c. and if success the apple will drop from the tree
5. and then if that is success prompt user to "make your own super duper machine", and show a small set of options (dont actually implement yet)
    - sensor: Gyro, Acceleration, Compass, Orientation angles, GPS, Touch, Mic Level, Camera
    - action: leave it for now


how does it look
give is basic html style like the nutrition label in the same repo


architecture
it can be standalone, or you can integrate this and the label into a index first

---


    
Iteration on style
css 3d replace img background, use css style for the background, tree, and apple, if possible, use the low poly 
    - reference: https://codepen.io/pentagear/pen/xxVbBZy
  
superdupermachine the three words can be closer and clamp the size to make them responsive to the window size


---

~~deployed on vercel~~

TODO: iterate on the ui


Iteration on functionality (continue from '5.' in the first function description)
  it looks like even 3d can work, what i dont like is how it is still very simulated and it doesn't say much why 'super duper', maybe the preset is not crazy enough 

  ideas
     - less distraction from the style, use more black and white but with the same geographic setup
     - give users more presets: play drum
     - show the blocks underneath the apple drop
     - use scribble style instead of this intimidating 3d style that makes you wanna be cool rather than creative
     - simpler actions in the user self creation part (also make it a side bar or something ppl can access whenever)
     - each super duper machine is an apple doesn't make sense, user should be able to give the form to the machine, but perhaps it should have some kind of preset form that is for example the combination of some "sensor/action" visualized
     - perhaps the ui should be more like what i had in mind like noodley, stretchy?, maybe a bit of late 80s but it is a recreation, less coatic
      - no it will be simple, and user first draw like a circle for "machine body", and for some sensors, user can add preset or draw themselves and define like combined sensor/text/audio effect

