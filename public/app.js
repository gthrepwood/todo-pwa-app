function saveTodosLocally(todos) {
    localStorage.setItem('todos', JSON.stringify(todos));
}

function loadTodosFromLocalStorage() {
    const cachedTodos = localStorage.getItem('todos');
    return cachedTodos ? JSON.parse(cachedTodos) : [];
}

// Example modification for addTodo function
function addTodo(newTodo) {
    // Existing code to add the todo
    todos.push(newTodo);
    saveTodosLocally(todos); // Save todos after adding
}

// Example modification for deleteTodo function
function deleteTodo(todoId) {
    // Existing code to delete the todo
    todos = todos.filter(todo => todo.id !== todoId);
    saveTodosLocally(todos); // Save todos after deleting
}

// Update loadTodos to use localStorage as fallback
async function loadTodos() {
    try {
        // Existing API call to load todos
    } catch (error) {
        console.error("API load failed, loading from localStorage", error);
        todos = loadTodosFromLocalStorage(); // Fallback to localStorage
    }
}