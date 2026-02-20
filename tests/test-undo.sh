#!/bin/bash

# Test script for undo functionality

echo "=== TODO App Undo Tests ==="
echo ""

# Test 1: Get current todos
echo "1. Get current todos:"
curl -s http://localhost:3004/api/todos | jq '.'
echo ""

# Test 2: Delete todo with id=3
echo "2. Delete todo with id=3:"
curl -s -X DELETE http://localhost:3004/api/todos/3
echo ""
echo "After deletion:"
curl -s http://localhost:3004/api/todos | jq '.'
echo ""

# Test 3: Undo - restore previous state (with id=3)
echo "3. Undo - restore deleted todo (id=3):"
curl -s -X PUT http://localhost:3004/api/todos \
  -H "Content-Type: application/json" \
  -d '[
    {"id":2,"text":"test1","done":false},
    {"id":3,"text":"test2","done":false},
    {"id":8,"text":"Gg","done":true},
    {"id":9,"text":"oo","done":true},
    {"id":22,"text":"A","done":false},
    {"id":23,"text":"Jjjj","done":false},
    {"id":24,"text":"F","done":false},
    {"id":25,"text":"X","done":true},
    {"id":26,"text":"V","done":true},
    {"id":27,"text":"1","done":false},
    {"id":29,"text":"3","done":false}
  ]'
echo ""
echo "After undo:"
curl -s http://localhost:3004/api/todos | jq '.'
echo ""

# Test 4: Delete multiple todos and undo all
echo "4. Delete multiple todos (id=2 and id=3) and test multi-undo:"
echo "4a. Delete id=2:"
curl -s -X DELETE http://localhost:3004/api/todos/2
echo ""
echo "4b. Delete id=3:"
curl -s -X DELETE http://localhost:3004/api/todos/3
echo ""
echo "After deleting 2 items:"
curl -s http://localhost:3004/api/todos | jq '.'
echo ""

# Test 5: First undo (should restore id=3)
echo "5. First undo (restore id=3):"
curl -s -X PUT http://localhost:3004/api/todos \
  -H "Content-Type: application/json" \
  -d '[
    {"id":3,"text":"test2","done":false},
    {"id":8,"text":"Gg","done":true},
    {"id":9,"text":"oo","done":true},
    {"id":22,"text":"A","done":false},
    {"id":23,"text":"Jjjj","done":false},
    {"id":24,"text":"F","done":false},
    {"id":25,"text":"X","done":true},
    {"id":26,"text":"V","done":true},
    {"id":27,"text":"1","done":false},
    {"id":29,"text":"3","done":false}
  ]'
echo ""
echo "After first undo:"
curl -s http://localhost:3004/api/todos | jq '.'
echo ""

# Test 6: Second undo (should restore id=2)
echo "6. Second undo (restore id=2):"
curl -s -X PUT http://localhost:3004/api/todos \
  -H "Content-Type: application/json" \
  -d '[
    {"id":2,"text":"test1","done":false},
    {"id":3,"text":"test2","done":false},
    {"id":8,"text":"Gg","done":true},
    {"id":9,"text":"oo","done":true},
    {"id":22,"text":"A","done":false},
    {"id":23,"text":"Jjjj","done":false},
    {"id":24,"text":"F","done":false},
    {"id":25,"text":"X","done":true},
    {"id":26,"text":"V","done":true},
    {"id":27,"text":"1","done":false},
    {"id":29,"text":"3","done":false}
  ]'
echo ""
echo "After second undo (all restored):"
curl -s http://localhost:3004/api/todos | jq '.'
echo ""

echo "=== Tests Complete ==="
