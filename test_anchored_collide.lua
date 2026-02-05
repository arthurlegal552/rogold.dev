-- Test script for setting Anchored and CanCollide via script this is a test dont use it for anything else

print("Testing Anchored and CanCollide setting via script!")

-- Create a test part
local testPart = Instance.new('Part')
testPart.Name = "TestPart"
testPart.Position = Vector3.new(0, 3, 0)
testPart.Size = Vector3.new(4, 2, 2)
testPart.Color = Color3.new(1, 0.5, 0)
testPart.Anchored = false
testPart.CanCollide = true
testPart.Parent = workspace

print("Created test part")

-- Wait a bit
wait(2)

-- Set Anchored to true
testPart.Anchored = true
print("Set Anchored to true")

-- Wait a bit
wait(2)

-- Set CanCollide to false
testPart.CanCollide = false
print("Set CanCollide to false")

-- Wait a bit
wait(2)

-- Set CanCollide back to true
testPart.CanCollide = true
print("Set CanCollide back to true")

-- Set Anchored back to false
testPart.Anchored = false
print("Set Anchored back to false")

print("Test completed!")