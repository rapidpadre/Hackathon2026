# Dynamic Image Authentication

This is a simple browser app that asks a person to prove who they are by finding a matching animal in a picture.

The person chooses:

- Their favorite color
- Their favorite animal

Then the app creates a picture with many colored animal shapes. The person must click the animal that matches their choices.

## How to Open the App

1. Open the project folder on your computer.
2. Find the file named `index.html`.
3. Double-click `index.html`.
4. The app will open in your web browser.

You do not need to install anything. You do not need an account. You do not need to write code.

## How to Use the App

1. Choose a favorite color from the first drop-down menu.
2. Choose a favorite animal from the second drop-down menu.
3. Click `Generate challenge`.
4. Look at the image that appears.
5. Find the animal that matches your chosen color and animal.
6. Click the matching animal.

Example:

If you choose `Blue` and `Fox`, you need to click the blue fox in the image.

## Random Pick

If you do not want to choose the color and animal yourself, click `Random pick`.

The app will choose a random color and animal for you, then create the challenge.

## Timer

After the image is created, you have 20 seconds to click the correct animal.

If time runs out, the app will show `Access denied`.

To try again, click `Reset`.

## What Happens If You Click the Correct Animal

If you click the correct animal and your cursor movement looks natural enough, the app will show `Authenticated`.

That means the challenge was passed.

## What Happens If You Click the Wrong Animal

If you click the wrong animal, the app will show `Access denied`.

You must click `Reset` before trying again.

## Human Movement Score

The app watches how the mouse moves during the challenge.

It gives the movement a human confidence score.

If the score is too low, the app creates a new image and asks you to click your animal again.

If the score is too low a second time, the app shows `Access denied`.

This score is only a simple guess. It is not a real security system by itself.

## Reset Button

Click `Reset` when you want to start over.

Reset clears the current challenge and lets you choose a new color and animal.

## Files in This Project

- `index.html` controls the page layout.
- `styles.css` controls how the app looks.
- `script.js` controls how the app works.
- `README.md` is this instruction file.

## Important Note

This app is a demo project. It is useful for learning and showing an idea, but it should not be used as the only protection for a real account or private data.
