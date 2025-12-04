import pygame
import random
import json
import os
import time
from enum import Enum

# Initialize pygame
pygame.init()

# Constants
SCREEN_WIDTH = 800
SCREEN_HEIGHT = 600
FPS = 60
GRAVITY = 0.5
JUMP_STRENGTH = -10
PLAYER_SPEED = 5
MAP_SPEED = 1  # Speed at which the map moves (pixels per frame)

# Colors
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
GREEN = (0, 255, 0)
BROWN = (139, 69, 19)
DARK_GREEN = (0, 100, 0)
YELLOW = (255, 255, 0)
RED = (255, 0, 0)
BLUE = (0, 0, 255)
SKIN_COLOR = (210, 180, 140)
CLOTH_COLOR = (100, 70, 50)
HAT_COLOR = (50, 30, 20)

# Item types with probabilities and points
class ItemType(Enum):
    CLAY_POT = {"prob": 0.40, "points": 5, "color": BROWN}
    CLAY_BOWL = {"prob": 0.30, "points": 3, "color": (150, 100, 50)}
    WOODEN_SWORD = {"prob": 0.20, "points": 1, "color": (160, 120, 60)}
    IRON_SWORD = {"prob": 0.09, "points": 6, "color": (192, 192, 192)}
    GOLD_COIN = {"prob": 0.01, "points": 10, "color": YELLOW}

class Player:
    def __init__(self, x, y):
        self.x = x
        self.y = y
        self.width = 20
        self.height = 30
        self.vel_y = 0
        self.jumping = False
        self.rect = pygame.Rect(x, y, self.width, self.height)
        self.step_counter = 0  # For leg animation
        self.left_leg_height = 10
        self.right_leg_height = 10
        self.animation_speed = 0.2  # Speed of leg animation
        
    def update(self, platforms):
        # Apply gravity
        self.vel_y += GRAVITY
        self.y += self.vel_y
        
        # Update rect position
        self.rect.x = self.x
        self.rect.y = self.y
        
        # Update leg animation when moving
        if abs(self.vel_y) < 0.1:  # Not falling/jumping
            self.step_counter += self.animation_speed
            # Animate legs when moving horizontally
            keys = pygame.key.get_pressed()
            if keys[pygame.K_LEFT] or keys[pygame.K_RIGHT]:
                # Alternate leg heights to simulate stepping
                self.left_leg_height = 10 + int(3 * abs(pygame.math.sin(self.step_counter)))
                self.right_leg_height = 10 + int(3 * abs(pygame.math.cos(self.step_counter)))
            else:
                # Reset to default when not moving
                self.left_leg_height = 10
                self.right_leg_height = 10
        
        # Check for collisions with platforms
        for platform in platforms:
            if self.rect.colliderect(platform) and self.vel_y > 0:
                self.y = platform.y - self.height
                self.vel_y = 0
                self.jumping = False
                self.rect.y = self.y
    
    def jump(self):
        if not self.jumping:
            self.vel_y = JUMP_STRENGTH
            self.jumping = True
    
    def move_left(self):
        self.x -= PLAYER_SPEED
        self.rect.x = self.x
    
    def move_right(self):
        self.x += PLAYER_SPEED
        self.rect.x = self.x
    
    def draw(self, screen):
        # Draw body (torso)
        pygame.draw.rect(screen, CLOTH_COLOR, (self.x, self.y + 10, self.width, 15))
        
        # Draw head
        pygame.draw.circle(screen, SKIN_COLOR, (self.x + self.width//2, self.y + 8), 8)
        
        # Draw hat
        pygame.draw.rect(screen, HAT_COLOR, (self.x + self.width//2 - 10, self.y, 20, 5))
        pygame.draw.rect(screen, HAT_COLOR, (self.x + self.width//2 - 12, self.y + 3, 24, 3))
        
        # Draw animated legs
        pygame.draw.rect(screen, CLOTH_COLOR, (self.x + 3, self.y + 25, 5, self.left_leg_height))
        pygame.draw.rect(screen, CLOTH_COLOR, (self.x + 12, self.y + 25, 5, self.right_leg_height))
        
        # Draw feet
        pygame.draw.ellipse(screen, (50, 50, 50), (self.x + 2, self.y + 25 + self.left_leg_height, 7, 5))
        pygame.draw.ellipse(screen, (50, 50, 50), (self.x + 11, self.y + 25 + self.right_leg_height, 7, 5))
        
        # Draw arms
        pygame.draw.rect(screen, SKIN_COLOR, (self.x - 3, self.y + 12, 5, 8))
        pygame.draw.rect(screen, SKIN_COLOR, (self.x + self.width - 2, self.y + 12, 5, 8))

class Item:
    def __init__(self, x, y, item_type):
        self.x = x
        self.y = y
        self.type = item_type
        self.color = item_type.value["color"]
        self.points = item_type.value["points"]
        self.spawn_time = time.time()
        self.lifetime = 15  # Item disappears after 15 seconds
        self.warning_time = 3  # Warning starts 3 seconds before disappearing
        self.should_remove = False
        self.blink_timer = 0
        self.blink_visible = True
        self.width = 15
        self.height = 15
        self.rect = pygame.Rect(x, y, self.width, self.height)
    
    def update(self):
        # Check if item should disappear
        elapsed = time.time() - self.spawn_time
        if elapsed > self.lifetime:
            self.should_remove = True
        elif elapsed > self.lifetime - self.warning_time:
            # Start blinking in the last 3 seconds
            self.blink_timer += 1/FPS
            if self.blink_timer > 0.2:  # Toggle every 0.2 seconds
                self.blink_visible = not self.blink_visible
                self.blink_timer = 0
    
    def draw(self, screen):
        if not self.blink_visible:
            return
            
        # Draw different shapes based on item type
        if self.type == ItemType.CLAY_POT:
            # Draw pot shape
            pygame.draw.ellipse(screen, self.color, (self.x, self.y, self.width, self.height//2))
            pygame.draw.rect(screen, self.color, (self.x, self.y + self.height//2 - 3, self.width, 6))
        elif self.type == ItemType.CLAY_BOWL:
            # Draw bowl shape
            pygame.draw.ellipse(screen, self.color, (self.x, self.y, self.width, self.height//2))
        elif self.type == ItemType.WOODEN_SWORD or self.type == ItemType.IRON_SWORD:
            # Draw sword shape
            pygame.draw.rect(screen, self.color, (self.x + self.width//2 - 2, self.y, 4, self.height))
            pygame.draw.rect(screen, (200, 200, 200), (self.x + self.width//2 - 4, self.y + 5, 8, 3))  # hilt
        elif self.type == ItemType.GOLD_COIN:
            # Draw coin shape
            pygame.draw.circle(screen, self.color, (self.x + self.width//2, self.y + self.height//2), self.width//2)

class Tree:
    def __init__(self, x, y):
        self.x = x
        self.y = y
        self.width = 30
        self.height = 60
    
    def draw(self, screen):
        # Draw trunk
        pygame.draw.rect(screen, BROWN, (self.x + 12, self.y + 30, 6, 30))
        # Draw leaves
        pygame.draw.ellipse(screen, DARK_GREEN, (self.x, self.y, self.width, 40))

class Bush:
    def __init__(self, x, y):
        self.x = x
        self.y = y
        self.width = 25
        self.height = 20
    
    def draw(self, screen):
        # Draw bush as a green ellipse
        pygame.draw.ellipse(screen, GREEN, (self.x, self.y, self.width, self.height))

class Grass:
    def __init__(self, x, y, height):
        self.x = x
        self.y = y
        self.height = height
        self.width = 2
        self.color = (0, random.randint(150, 200), 0)

    def draw(self, screen, screen_offset_x):
        adjusted_x = self.x - screen_offset_x
        if -10 < adjusted_x < SCREEN_WIDTH + 10:  # Only draw if visible
            pygame.draw.line(screen, self.color, (adjusted_x, self.y), (adjusted_x, self.y - self.height), self.width)

class Game:
    def __init__(self):
        self.screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
        pygame.display.set_caption("Pixel Forest Explorer")
        self.clock = pygame.time.Clock()
        self.font = pygame.font.SysFont(None, 36)
        self.small_font = pygame.font.SysFont(None, 24)
        self.running = True
        self.game_state = "MENU"  # MENU, PLAYING
        self.score = 0
        self.player = None
        self.platforms = []
        self.items = []
        self.trees = []
        self.bushes = []
        self.grass = []
        self.screen_offset_x = 0  # How much the screen has moved (for following player)
        self.world_start_x = 0  # Leftmost position the player can go to
        self.last_item_spawn = time.time()
        self.save_file = "savegame.json"
        self.ground_y = SCREEN_HEIGHT - 40  # Ground level
        self.world_width = 5000  # Starting world width
        
        # Initialize the game world
        self.generate_world()
    
    def generate_world(self):
        # Generate initial platforms with holes
        self.platforms = []
        x = 0
        while x < self.world_width:
            # Randomly decide if we should have a hole
            if random.random() < 0.1:  # 10% chance for a hole
                # Create a hole (skip platform generation for this area)
                hole_width = random.randint(15, 30)  # Hole width: half player height to 1.5x player height
                x += hole_width
            else:
                # Create a platform segment
                segment_width = random.randint(50, 200)  # Random segment length
                platform = pygame.Rect(x, self.ground_y, segment_width, 40)
                self.platforms.append(platform)
                x += segment_width
        
        # Generate initial trees and bushes
        self.trees = []
        self.bushes = []
        self.grass = []
        
        # Generate world elements based on platforms
        for platform in self.platforms:
            platform_start = platform.x
            platform_end = platform.x + platform.width
            
            # Add elements along this platform segment
            x = platform_start
            while x < platform_end:
                # Add trees (20-300% of player height)
                if random.random() < 0.05:  # 5% chance
                    tree_height = random.randint(60, 90)  # 200-300% of player height (30px)
                    self.trees.append(Tree(x, self.ground_y - tree_height))
                # Add bushes (10-30% of player height)
                elif random.random() < 0.15:  # 15% chance of bush if not tree
                    bush_height = random.randint(3, 9)  # 10-30% of player height
                    self.bushes.append(Bush(x, self.ground_y - bush_height))
                # Add grass (2-5% of player height)
                elif random.random() < 0.7:  # 70% chance of grass if not tree or bush
                    grass_height = random.randint(1, 2)  # 2-5% of player height (30px * 0.02-0.05)
                    self.grass.append(Grass(x, self.ground_y, grass_height))
                
                x += random.randint(5, 20)  # Space between elements
    
    def extend_world(self):
        # Extend the world by adding more platforms and elements
        # Find the rightmost platform
        rightmost_x = max([p.x + p.width for p in self.platforms]) if self.platforms else 0
        
        # Add new platforms to extend the world
        x = rightmost_x
        while x < rightmost_x + 1000:  # Add 1000 pixels worth of new platforms
            if random.random() < 0.1:  # 10% chance for a hole
                # Create a hole (skip platform generation for this area)
                hole_width = random.randint(15, 30)
                x += hole_width
            else:
                # Create a platform segment
                segment_width = random.randint(50, 200)
                platform = pygame.Rect(x, self.ground_y, segment_width, 40)
                self.platforms.append(platform)
                
                # Add elements to the new platform segment
                x_elem = x
                while x_elem < x + segment_width:
                    if random.random() < 0.05:  # 5% chance for tree
                        tree_height = random.randint(60, 90)
                        self.trees.append(Tree(x_elem, self.ground_y - tree_height))
                    elif random.random() < 0.15:  # 15% chance for bush
                        bush_height = random.randint(3, 9)
                        self.bushes.append(Bush(x_elem, self.ground_y - bush_height))
                    elif random.random() < 0.7:  # 70% chance for grass
                        grass_height = random.randint(1, 2)
                        self.grass.append(Grass(x_elem, self.ground_y, grass_height))
                    
                    x_elem += random.randint(5, 20)
                
                x += segment_width
        
        # Update world width
        self.world_width = max(self.world_width, rightmost_x + 1000)
    
    def spawn_item(self):
        # Randomly decide if an item should spawn
        if random.random() < 0.3:  # 30% chance to spawn an item
            # Determine item type based on probabilities
            rand = random.random()
            item_type = None
            
            if rand < ItemType.CLAY_POT.value["prob"]:
                item_type = ItemType.CLAY_POT
            elif rand < ItemType.CLAY_POT.value["prob"] + ItemType.CLAY_BOWL.value["prob"]:
                item_type = ItemType.CLAY_BOWL
            elif rand < ItemType.CLAY_POT.value["prob"] + ItemType.CLAY_BOWL.value["prob"] + ItemType.WOODEN_SWORD.value["prob"]:
                item_type = ItemType.WOODEN_SWORD
            elif rand < ItemType.CLAY_POT.value["prob"] + ItemType.CLAY_BOWL.value["prob"] + ItemType.WOODEN_SWORD.value["prob"] + ItemType.IRON_SWORD.value["prob"]:
                item_type = ItemType.IRON_SWORD
            else:
                item_type = ItemType.GOLD_COIN
            
            # Spawn item at a position in the world ahead of the player (in visible area)
            x = self.screen_offset_x + random.randint(SCREEN_WIDTH//2, SCREEN_WIDTH + 200)
            y = self.ground_y - 30  # Above the ground platform
            
            self.items.append(Item(x, y, item_type))
    
    def handle_events(self):
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                self.running = False
            
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    if self.game_state == "PLAYING":
                        self.save_game()
                        self.game_state = "MENU"
                
                if self.game_state == "PLAYING":
                    if event.key == pygame.K_SPACE or event.key == pygame.K_UP:
                        self.player.jump()
                
                elif self.game_state == "MENU":
                    if event.key == pygame.K_1:
                        self.start_new_game()
                    elif event.key == pygame.K_2:
                        self.load_game()
                    elif event.key == pygame.K_3:
                        self.running = False
    
    def start_new_game(self):
        self.game_state = "PLAYING"
        self.score = 0
        # Start player at center of screen with appropriate world offset
        self.screen_offset_x = 0  # Start at beginning of world
        self.player = Player(SCREEN_WIDTH // 2, SCREEN_HEIGHT - 100)
        self.items = []
        self.last_item_spawn = time.time()
        self.generate_world()
        self.world_start_x = 0  # Reset the leftmost position
    
    def load_game(self):
        try:
            with open(self.save_file, 'r') as f:
                save_data = json.load(f)
                self.score = save_data.get('score', 0)
                self.screen_offset_x = save_data.get('screen_offset_x', 0)
                self.items = []
                
                # Recreate items from save data
                for item_data in save_data.get('items', []):
                    item_type = ItemType(item_data['type'])
                    item = Item(item_data['x'], item_data['y'], item_type)
                    item.spawn_time = item_data['spawn_time']
                    self.items.append(item)
                
                self.player = Player(save_data.get('player_x', SCREEN_WIDTH // 2), 
                                   save_data.get('player_y', SCREEN_HEIGHT - 100))
                self.world_start_x = save_data.get('world_start_x', 0)
            
            self.game_state = "PLAYING"
        except FileNotFoundError:
            # If no save file exists, start a new game
            self.start_new_game()
    
    def save_game(self):
        save_data = {
            'score': self.score,
            'screen_offset_x': self.screen_offset_x,
            'player_x': self.player.x,
            'player_y': self.player.y,
            'world_start_x': self.world_start_x,
            'items': [
                {
                    'type': item.type.name,
                    'x': item.x,
                    'y': item.y,
                    'spawn_time': item.spawn_time
                }
                for item in self.items
            ]
        }
        
        with open(self.save_file, 'w') as f:
            json.dump(save_data, f)
    
    def update(self):
        if self.game_state == "PLAYING":
            # Handle player movement
            keys = pygame.key.get_pressed()
            
            # Calculate potential new player position
            new_player_x = self.player.x
            if keys[pygame.K_LEFT]:
                new_player_x -= PLAYER_SPEED
            if keys[pygame.K_RIGHT]:
                new_player_x += PLAYER_SPEED
            
            # Check if player is trying to go left of the world start
            if new_player_x < self.world_start_x:
                # Don't allow movement beyond the left boundary
                self.player.x = self.world_start_x
            else:
                # Apply movement
                if keys[pygame.K_LEFT]:
                    self.player.move_left()
                if keys[pygame.K_RIGHT]:
                    self.player.move_right()
            
            # Update player (apply gravity and collision)
            self.player.update(self.platforms)
            
            # Implement screen following with proper logic
            # Screen follows player only when moving right from center
            player_screen_pos = self.player.x - self.screen_offset_x
            
            # If player is past the right half of the screen, move the screen
            if player_screen_pos > SCREEN_WIDTH * 0.6:  # Player is past 60% of screen width
                # Move screen to keep player in right portion of screen
                self.screen_offset_x = self.player.x - int(SCREEN_WIDTH * 0.6)
            # If player is too far left (past 40% of screen), move screen back
            elif player_screen_pos < SCREEN_WIDTH * 0.4 and self.screen_offset_x > 0:
                # Move screen back to keep player in left portion of screen
                self.screen_offset_x = self.player.x - int(SCREEN_WIDTH * 0.4)
                # Don't let screen go past the start of the world
                if self.screen_offset_x < 0:
                    self.screen_offset_x = 0
                    # Adjust player position if needed
                    self.player.x = int(SCREEN_WIDTH * 0.4)
            
            # Ensure player doesn't go past the left edge of the world
            if self.player.x < self.world_start_x:
                self.player.x = self.world_start_x
            
            # Generate new platforms and elements as the player moves right
            if self.screen_offset_x > self.world_width - SCREEN_WIDTH * 2:
                # Extend the world if needed
                self.extend_world()
            
            # Update items and remove those that are off-screen or expired
            for item in self.items[:]:  # Use slice to iterate over a copy
                item.update()
                
                # Items stay in world position, no need to move them with screen
                
                # Check if item is off-screen to the left (past where player can return)
                if item.x < self.world_start_x - 50:
                    if item in self.items:
                        self.items.remove(item)
                
                # Check for collision with player
                # Player is always at center of screen, so use screen-centered coordinates for collision
                player_rect = pygame.Rect(SCREEN_WIDTH // 2, self.player.y, self.player.width, self.player.height)
                item_rect = pygame.Rect(item.x - self.screen_offset_x, item.y, item.width, item.height)
                
                if player_rect.colliderect(item_rect):
                    self.score += item.points
                    if item in self.items:
                        self.items.remove(item)
                
                # Remove expired items
                if item.should_remove:
                    if item in self.items:
                        self.items.remove(item)
            
            # Spawn new items periodically in front of the player
            if time.time() - self.last_item_spawn > 2:  # Spawn every 2 seconds
                self.spawn_item()
                self.last_item_spawn = time.time()
    
    def draw_menu(self):
        self.screen.fill(BLACK)
        
        title = self.font.render("PIXEL FOREST EXPLORER", True, WHITE)
        self.screen.blit(title, (SCREEN_WIDTH//2 - title.get_width()//2, 150))
        
        menu_text = [
            "1. NEW GAME",
            "2. CONTINUE",
            "3. EXIT"
        ]
        
        for i, text in enumerate(menu_text):
            rendered = self.font.render(text, True, WHITE)
            self.screen.blit(rendered, (SCREEN_WIDTH//2 - rendered.get_width()//2, 250 + i*50))
        
        # Draw instructions
        instructions = [
            "CONTROLS:",
            "Arrow Keys: Move",
            "Space/Up: Jump",
            "ESC: Save & Menu"
        ]
        
        for i, text in enumerate(instructions):
            rendered = self.small_font.render(text, True, (200, 200, 200))
            self.screen.blit(rendered, (50, SCREEN_HEIGHT - 120 + i*25))
    
    def draw_game(self):
        # Draw sky background
        self.screen.fill((135, 206, 235))  # Sky blue
        
        # Draw platforms (ground segments with holes)
        for platform in self.platforms:
            # Calculate adjusted platform position based on screen offset
            adjusted_x = platform.x - self.screen_offset_x
            # Only draw if platform is visible on screen
            if -50 < adjusted_x < SCREEN_WIDTH + 50:
                pygame.draw.rect(self.screen, (101, 67, 33), (adjusted_x, platform.y, platform.width, platform.height))  # Brown ground
        
        # Draw grass
        for grass in self.grass:
            grass.draw(self.screen, self.screen_offset_x)
        
        # Draw trees and bushes (with offset)
        for tree in self.trees:
            adjusted_x = tree.x - self.screen_offset_x
            if -50 < adjusted_x < SCREEN_WIDTH + 50:  # Only draw if visible
                # Draw tree with screen offset
                # Draw trunk
                pygame.draw.rect(self.screen, BROWN, (adjusted_x + 12, tree.y + 30, 6, 30))
                # Draw leaves
                pygame.draw.ellipse(self.screen, DARK_GREEN, (adjusted_x, tree.y, tree.width, 40))
        
        for bush in self.bushes:
            adjusted_x = bush.x - self.screen_offset_x
            if -50 < adjusted_x < SCREEN_WIDTH + 50:  # Only draw if visible
                # Draw bush with screen offset
                pygame.draw.ellipse(self.screen, GREEN, (adjusted_x, bush.y, bush.width, bush.height))
        
        # Draw items
        for item in self.items:
            # Draw item with screen offset
            adjusted_x = item.x - self.screen_offset_x
            
            # Only draw if item is visible on screen
            if -20 < adjusted_x < SCREEN_WIDTH + 20 and item.blink_visible:
                # Draw different shapes based on item type
                if item.type == ItemType.CLAY_POT:
                    # Draw pot shape
                    pygame.draw.ellipse(self.screen, item.color, (adjusted_x, item.y, item.width, item.height//2))
                    pygame.draw.rect(self.screen, item.color, (adjusted_x, item.y + item.height//2 - 3, item.width, 6))
                elif item.type == ItemType.CLAY_BOWL:
                    # Draw bowl shape
                    pygame.draw.ellipse(self.screen, item.color, (adjusted_x, item.y, item.width, item.height//2))
                elif item.type == ItemType.WOODEN_SWORD or item.type == ItemType.IRON_SWORD:
                    # Draw sword shape
                    pygame.draw.rect(self.screen, item.color, (adjusted_x + item.width//2 - 2, item.y, 4, item.height))
                    pygame.draw.rect(self.screen, (200, 200, 200), (adjusted_x + item.width//2 - 4, item.y + 5, 8, 3))  # hilt
                elif item.type == ItemType.GOLD_COIN:
                    # Draw coin shape
                    pygame.draw.circle(self.screen, item.color, (adjusted_x + item.width//2, item.y + item.height//2), item.width//2)
        
        # Draw player (always centered on screen)
        player_screen_x = SCREEN_WIDTH // 2
        # Temporarily create a player to draw at the correct screen position
        temp_player = Player(player_screen_x, self.player.y)
        temp_player.width = self.player.width
        temp_player.height = self.player.height
        temp_player.left_leg_height = self.player.left_leg_height
        temp_player.right_leg_height = self.player.right_leg_height
        temp_player.draw(self.screen)
        
        # Draw score
        score_text = self.font.render(f"SCORE: {self.score}", True, WHITE)
        self.screen.blit(score_text, (10, 10))
    
    def run(self):
        while self.running:
            self.handle_events()
            
            if self.game_state == "PLAYING":
                self.update()
            
            if self.game_state == "MENU":
                self.draw_menu()
            elif self.game_state == "PLAYING":
                self.draw_game()
            
            pygame.display.flip()
            self.clock.tick(FPS)
        
        pygame.quit()

if __name__ == "__main__":
    game = Game()
    game.run()