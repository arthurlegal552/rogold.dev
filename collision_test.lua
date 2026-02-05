-- Collision Test Script for RoGold Studio
-- This script demonstrates collision detection and physics this is a test dont use it for anything else

print("Collision Test Script Loaded!")

-- Create two parts that will collide
local part1 = Instance.new('Part')
part1.Name = "CollisionPart1"
part1.Position = Vector3.new(0, 10, 0)
part1.Size = Vector3.new(4, 4, 4)
part1.Color = Color3.new(1, 0, 0) -- Red
part1.Anchored = false
part1.CanCollide = true
part1.Parent = workspace

local part2 = Instance.new('Part')
part2.Name = "CollisionPart2"
part2.Position = Vector3.new(5, 15, 0)
part2.Size = Vector3.new(4, 4, 4)
part2.Color = Color3.new(0, 0, 1) -- Blue
part2.Anchored = false
part2.CanCollide = true
part2.Parent = workspace

print("Created two colliding parts!")

-- Set up collision detection
part1.Touched:Connect(function(hit)
    print("Part1 touched: " .. hit.Name)
    part1.Color = Color3.new(0, 1, 0) -- Turn green on collision
end)

part2.Touched:Connect(function(hit)
    print("Part2 touched: " .. hit.Name)
    part2.Color = Color3.new(1, 1, 0) -- Turn yellow on collision
end)

print("Collision detection set up successfully!")