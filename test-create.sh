#!/bin/bash

TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJjbWswd2U5ZmQwMDBwaDU1Mmd1NnJtemVlIiwiZW1wbG95ZWVJZCI6IkFETUlOMDAxIiwiZW1haWwiOiJhZG1pbkBvZ3AuZ292LnNnIiwibmFtZSI6IlN5c3RlbSBBZG1pbiIsInJvbGUiOiJBRE1JTiIsImRlcGFydG1lbnRJZCI6ImNtazB3ZTdmMjAwMDloNTUyNGZ3Z3FtbGciLCJpYXQiOjE3Njg4MDcwODksImV4cCI6MTc2ODgxMDY4OX0.zW4UmBw6WIMwmsMqvQKIjt8wppd15_b2n95vIlzyNmU"

# Test 1: Create "Others" type without customTypeName (should fail)
echo "Test 1: Create Others without customTypeName (should fail):"
curl -s http://localhost:3001/api/contraventions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "employeeId": "cmke0qn760000ql52ejag3xfd",
    "typeId": "cmk0we8rg000nh5527kjbn7sv",
    "teamId": "cmkce71dg0000lb04jduifcqs",
    "description": "Test Others contravention without custom type name",
    "justification": "Testing validation",
    "mitigation": "Testing mitigation",
    "incidentDate": "2026-01-15"
  }' | python3 -m json.tool

echo ""
echo "Test 2: Create Others with customTypeName (should succeed):"
curl -s http://localhost:3001/api/contraventions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "employeeId": "cmke0qn760000ql52ejag3xfd",
    "typeId": "cmk0we8rg000nh5527kjbn7sv",
    "teamId": "cmkce71dg0000lb04jduifcqs",
    "customTypeName": "Unauthorized Travel Expense",
    "description": "Test Others contravention with custom type name",
    "justification": "Testing validation with custom type",
    "mitigation": "Testing mitigation measures",
    "incidentDate": "2026-01-15"
  }' | python3 -m json.tool

echo ""
echo "Test 3: Create standard type (Late Claims >90 days):"
curl -s http://localhost:3001/api/contraventions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "employeeId": "cmke0qn760000ql52ejag3xfd",
    "typeId": "cmkktsbwx000652p6drvz0e7n",
    "teamId": "cmkce71dg0000lb04jduifcqs",
    "description": "Test standard contravention type",
    "justification": "Testing standard type",
    "mitigation": "Standard mitigation measures",
    "incidentDate": "2026-01-15"
  }' | python3 -m json.tool
