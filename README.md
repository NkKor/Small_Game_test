# Pixel Forest Explorer

A 2D pixel platformer game where you control a pixel prospector exploring a procedurally generated forest, collecting artifacts and treasures.

## Game Features

- 800x600 windowed pixel graphics
- Procedurally generated forest environment with trees, bushes, and grass
- Screen follows the player keeping them centered
- Collectible items with different point values:
  - Clay Pot: 5 points (40% spawn chance)
  - Clay Bowl: 3 points (30% spawn chance)
  - Wooden Sword: 1 point (20% spawn chance)
  - Iron Sword: 6 points (9% spawn chance)
  - Gold Coin: 10 points (1% spawn chance)
- Items stay in world positions and don't move with the scrolling world
- Items disappear after 15 seconds if not collected (with 3-second warning blink)
- One-way movement: Player can only move right and explore new areas, but cannot return to previously explored areas
- Main menu with New Game, Continue, and Exit options
- Score tracking system

## Controls

- Arrow Keys: Move character
- Space/Up Arrow: Jump
- ESC: Save progress and return to main menu

## Requirements

- Python 3.9-3.11
- pygame==2.5.2

## Installation

1. Install Python 3.9-3.11
2. Install dependencies: `pip install -r requirements.txt`
3. Run the game: `python main.py`

## How to Play

Navigate through the forest as the pixel prospector, collecting items to earn points. The screen follows your character, creating a sense of exploration. Move right to discover new areas - you cannot return to areas you've already passed. Collect items before they disappear or move off-screen!
