# Pixel Forest Explorer

A 2D pixel platformer game where you control a pixel prospector exploring a procedurally generated forest, collecting artifacts and treasures.

## Game Features

- 800x600 windowed pixel graphics
- Procedurally generated forest environment with trees and bushes
- Collectible items with different point values:
  - Clay Pot: 5 points (40% spawn chance)
  - Clay Bowl: 3 points (30% spawn chance)
  - Wooden Sword: 1 point (20% spawn chance)
  - Iron Sword: 6 points (9% spawn chance)
  - Gold Coin: 10 points (1% spawn chance)
- Items disappear after 15 seconds if not collected (with 3-second warning blink)
- Main menu with New Game, Continue, and Exit options
- Score tracking system

## Controls

- Arrow Keys: Move character
- ESC: Save progress and return to main menu

## Requirements

- Python 3.9-3.11
- pygame==2.5.2

## Installation

1. Install Python 3.9-3.11
2. Install dependencies: `pip install -r requirements.txt`
3. Run the game: `python main.py`

## How to Play

Navigate through the forest as the pixel prospector, collecting items to earn points. The environment moves slowly from right to left, creating a sense of movement. Collect items before they disappear or move off-screen!
