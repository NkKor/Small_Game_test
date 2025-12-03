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
        
    def update(self, platforms):
        # Apply gravity
        self.vel_y += GRAVITY
        self.y += self.vel_y
        
        # Update rect position
        self.rect.x = self.x
        self.rect.y = self.y
        
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
        if self.x < 0:
            self.x = 0
        self.rect.x = self.x
    
    def move_right(self):
        self.x += PLAYER_SPEED
        if self.x > SCREEN_WIDTH - self.width:
            self.x = SCREEN_WIDTH - self.width
        self.rect.x = self.x
    
    def draw(self, screen):
        # Draw body (torso)
        pygame.draw.rect(screen, CLOTH_COLOR, (self.x, self.y + 10, self.width, 15))
        
        # Draw head
        pygame.draw.circle(screen, SKIN_COLOR, (self.x + self.width//2, self.y + 8), 8)
        
        # Draw hat
        pygame.draw.rect(screen, HAT_COLOR, (self.x + self.width//2 - 10, self.y, 20, 5))
        pygame.draw.rect(screen, HAT_COLOR, (self.x + self.width//2 - 12, self.y + 3, 24, 3))
        
        # Draw legs
        pygame.draw.rect(screen, CLOTH_COLOR, (self.x + 3, self.y + 25, 5, 10))
        pygame.draw.rect(screen, CLOTH_COLOR, (self.x + 12, self.y + 25, 5, 10))
        
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
        self.world_offset = 0  # How much the world has moved
        self.last_item_spawn = time.time()
        self.save_file = "savegame.json"
        
        # Initialize the game world
        self.generate_world()
    
    def generate_world(self):
        # Generate initial platforms
        self.platforms = [
            pygame.Rect(0, SCREEN_HEIGHT - 40, SCREEN_WIDTH, 40),  # Ground
        ]
        
        # Generate initial trees and bushes
        self.trees = []
        self.bushes = []
        
        # Generate some initial trees and bushes in the visible area and beyond
        for i in range(20):
            x = random.randint(-100, SCREEN_WIDTH + 200)
            y = SCREEN_HEIGHT - 100
            if random.random() < 0.5:
                self.trees.append(Tree(x, y))
            else:
                self.bushes.append(Bush(x, y))
    
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
            
            # Spawn item at a random position on the ground
            x = random.randint(50, SCREEN_WIDTH - 50)
            y = SCREEN_HEIGHT - 60  # Above the ground platform
            
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
        self.player = Player(SCREEN_WIDTH // 2, SCREEN_HEIGHT - 100)
        self.items = []
        self.world_offset = 0
        self.last_item_spawn = time.time()
        self.generate_world()
    
    def load_game(self):
        try:
            with open(self.save_file, 'r') as f:
                save_data = json.load(f)
                self.score = save_data.get('score', 0)
                self.world_offset = save_data.get('world_offset', 0)
                self.items = []
                
                # Recreate items from save data
                for item_data in save_data.get('items', []):
                    item_type = ItemType(item_data['type'])
                    item = Item(item_data['x'], item_data['y'], item_type)
                    item.spawn_time = item_data['spawn_time']
                    self.items.append(item)
                
                self.player = Player(save_data.get('player_x', SCREEN_WIDTH // 2), 
                                   save_data.get('player_y', SCREEN_HEIGHT - 100))
            
            self.game_state = "PLAYING"
        except FileNotFoundError:
            # If no save file exists, start a new game
            self.start_new_game()
    
    def save_game(self):
        save_data = {
            'score': self.score,
            'world_offset': self.world_offset,
            'player_x': self.player.x,
            'player_y': self.player.y,
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
            if keys[pygame.K_LEFT]:
                self.player.move_left()
            if keys[pygame.K_RIGHT]:
                self.player.move_right()
            
            # Update player
            self.player.update(self.platforms)
            
            # Move world to create movement effect
            self.world_offset += MAP_SPEED
            
            # Update items and remove those that are off-screen or expired
            for item in self.items[:]:  # Use slice to iterate over a copy
                item.update()
                
                # Move item with the world
                item.x -= MAP_SPEED
                item.rect.x = item.x
                
                # Check if item is off-screen to the left
                if item.x < -50:
                    self.items.remove(item)
                
                # Check for collision with player
                if self.player.rect.colliderect(item.rect):
                    self.score += item.points
                    self.items.remove(item)
                
                # Remove expired items
                if item.should_remove:
                    if item in self.items:
                        self.items.remove(item)
            
            # Spawn new items periodically
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
        
        # Draw ground
        pygame.draw.rect(self.screen, (101, 67, 33), (0, SCREEN_HEIGHT - 40, SCREEN_WIDTH, 40))  # Brown ground
        
        # Draw trees and bushes (with offset)
        for tree in self.trees:
            adjusted_x = tree.x - self.world_offset
            if -50 < adjusted_x < SCREEN_WIDTH + 50:  # Only draw if visible
                tree.draw(self.screen)
        
        for bush in self.bushes:
            adjusted_x = bush.x - self.world_offset
            if -50 < adjusted_x < SCREEN_WIDTH + 50:  # Only draw if visible
                bush.draw(self.screen)
        
        # Draw items
        for item in self.items:
            item.draw(self.screen)
        
        # Draw player
        self.player.draw(self.screen)
        
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