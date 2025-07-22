import { storage } from '../storage';

interface AIAction {
  type: 'create_file' | 'update_file' | 'delete_file' | 'create_folder';
  fileName?: string;
  filePath?: string;
  content?: string;
  fileId?: number;
}

interface AIResponse {
  message: string;
  actions?: AIAction[];
  success: boolean;
}

export async function processAIRequest(message: string, projectId: number, userId: string): Promise<AIResponse> {
  try {
    const lowerMessage = message.toLowerCase();
    const project = await storage.getProject(projectId);
    
    if (!project || project.userId !== userId) {
      return {
        message: "Project not found or access denied.",
        success: false
      };
    }

    const files = await storage.getProjectFiles(projectId);
    const actions: AIAction[] = [];
    let responseMessage = "";

    // Handle file creation requests
    if (lowerMessage.includes('create') && (lowerMessage.includes('file') || lowerMessage.includes('component'))) {
      if (lowerMessage.includes('html') || lowerMessage.includes('index')) {
        const htmlContent = await generateHTMLTemplate(message, files);
        actions.push({
          type: 'create_file',
          fileName: 'index.html',
          filePath: '/index.html',
          content: htmlContent
        });
        responseMessage = "I've created an HTML file with a basic structure. You can customize it further!";
      } else if (lowerMessage.includes('css') || lowerMessage.includes('style')) {
        const cssContent = await generateCSSTemplate(message, files);
        actions.push({
          type: 'create_file',
          fileName: 'styles.css',
          filePath: '/styles.css',
          content: cssContent
        });
        responseMessage = "I've created a CSS file with some basic styling. Feel free to modify it!";
      } else if (lowerMessage.includes('js') || lowerMessage.includes('javascript')) {
        const jsContent = await generateJavaScriptTemplate(message, files);
        actions.push({
          type: 'create_file',
          fileName: 'script.js',
          filePath: '/script.js',
          content: jsContent
        });
        responseMessage = "I've created a JavaScript file with some starter code. Add your functionality here!";
      } else if (lowerMessage.includes('react') || lowerMessage.includes('component')) {
        const componentContent = await generateReactComponent(message);
        actions.push({
          type: 'create_file',
          fileName: 'Component.jsx',
          filePath: '/Component.jsx',
          content: componentContent
        });
        responseMessage = "I've created a React component for you. You can customize it as needed!";
      }
    }
    
    // Handle specific application requests
    else if (lowerMessage.includes('todo') || lowerMessage.includes('task')) {
      const todoFiles = await generateTodoApp();
      actions.push(...todoFiles);
      responseMessage = "I've created a complete Todo app with HTML, CSS, and JavaScript. You can add, edit, and delete tasks!";
    }
    
    else if (lowerMessage.includes('calculator')) {
      const calcFiles = await generateCalculatorApp();
      actions.push(...calcFiles);
      responseMessage = "I've created a calculator app with a clean interface and basic arithmetic operations!";
    }
    
    else if (lowerMessage.includes('weather') || lowerMessage.includes('api')) {
      const weatherFiles = await generateWeatherApp();
      actions.push(...weatherFiles);
      responseMessage = "I've created a weather app that fetches real weather data. You'll need to add your API key!";
    }
    
    // Handle code fixes and improvements
    else if (lowerMessage.includes('fix') || lowerMessage.includes('error') || lowerMessage.includes('debug')) {
      const suggestions = await analyzeAndFixCode(files, message);
      responseMessage = suggestions.message;
      if (suggestions.actions) {
        actions.push(...suggestions.actions);
      }
    }
    
    // Handle styling requests
    else if (lowerMessage.includes('style') || lowerMessage.includes('design') || lowerMessage.includes('look')) {
      const styleUpdates = await improveProjectStyling(files, message);
      actions.push(...styleUpdates.actions);
      responseMessage = styleUpdates.message;
    }
    
    // Default helpful response
    else {
      responseMessage = generateContextualResponse(message, files);
    }

    // Execute actions
    for (const action of actions) {
      await executeAIAction(action, projectId);
    }

    return {
      message: responseMessage,
      actions,
      success: true
    };
  } catch (error) {
    console.error('Error processing AI request:', error);
    return {
      message: "I encountered an error processing your request. Please try again.",
      success: false
    };
  }
}

async function executeAIAction(action: AIAction, projectId: number): Promise<void> {
  switch (action.type) {
    case 'create_file':
      if (action.fileName && action.filePath && action.content) {
        await storage.createFile({
          name: action.fileName,
          path: action.filePath,
          content: action.content,
          isFolder: false,
          projectId
        });
      }
      break;
      
    case 'update_file':
      if (action.fileId && action.content) {
        await storage.updateFile(action.fileId, { content: action.content });
      }
      break;
      
    case 'delete_file':
      if (action.fileId) {
        await storage.deleteFile(action.fileId);
      }
      break;
      
    case 'create_folder':
      if (action.fileName && action.filePath) {
        await storage.createFile({
          name: action.fileName,
          path: action.filePath,
          content: '',
          isFolder: true,
          projectId
        });
      }
      break;
  }
}

async function generateHTMLTemplate(message: string, files: any[]): Promise<string> {
  const hasCSS = files.some(f => f.name.endsWith('.css'));
  const hasJS = files.some(f => f.name.endsWith('.js'));
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My App</title>
    ${hasCSS ? '<link rel="stylesheet" href="styles.css">' : `
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            line-height: 1.6;
        }
        .container {
            text-align: center;
            margin-top: 2rem;
        }
        button {
            background: #007acc;
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 4px;
            cursor: pointer;
            font-size: 1rem;
        }
        button:hover {
            background: #005999;
        }
    </style>`}
</head>
<body>
    <div class="container">
        <h1>Welcome to My App</h1>
        <p>This is your new application. Start building something amazing!</p>
        <button onclick="handleClick()">Get Started</button>
    </div>
    
    ${hasJS ? '<script src="script.js"></script>' : `
    <script>
        function handleClick() {
            alert('Hello from your new app!');
        }
    </script>`}
</body>
</html>`;
}

async function generateCSSTemplate(message: string, files: any[]): Promise<string> {
  return `/* Modern CSS Reset and Base Styles */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
    line-height: 1.6;
    color: #333;
    background-color: #f8f9fa;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
}

/* Header Styles */
h1, h2, h3 {
    margin-bottom: 1rem;
    color: #2c3e50;
}

h1 {
    font-size: 2.5rem;
    text-align: center;
    margin-bottom: 2rem;
}

/* Button Styles */
button {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    cursor: pointer;
    font-size: 1rem;
    transition: transform 0.2s, box-shadow 0.2s;
}

button:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

/* Card Component */
.card {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    margin-bottom: 1rem;
}

/* Responsive Design */
@media (max-width: 768px) {
    .container {
        padding: 1rem;
    }
    
    h1 {
        font-size: 2rem;
    }
}`;
}

async function generateJavaScriptTemplate(message: string, files: any[]): Promise<string> {
  return `// Modern JavaScript for your application

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('App initialized successfully!');
    initializeApp();
});

function initializeApp() {
    // App initialization code
    setupEventListeners();
    loadInitialData();
}

function setupEventListeners() {
    // Add event listeners for buttons and interactive elements
    const buttons = document.querySelectorAll('button');
    buttons.forEach(button => {
        button.addEventListener('click', handleButtonClick);
    });
}

function handleButtonClick(event) {
    const button = event.target;
    console.log('Button clicked:', button.textContent);
    
    // Add your button logic here
    button.style.transform = 'scale(0.95)';
    setTimeout(() => {
        button.style.transform = 'scale(1)';
    }, 150);
}

function loadInitialData() {
    // Load any initial data your app needs
    console.log('Loading initial data...');
}

// Utility Functions
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = \`notification \${type}\`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Example API function
async function fetchData(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(\`HTTP error! status: \${response.status}\`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching data:', error);
        showNotification('Error loading data', 'error');
    }
}

// Export functions if using modules
// export { initializeApp, showNotification, fetchData };`;
}

async function generateTodoApp(): Promise<AIAction[]> {
  return [
    {
      type: 'create_file',
      fileName: 'index.html',
      filePath: '/index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Todo App</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div class="container">
        <h1>📝 Todo App</h1>
        <div class="todo-input">
            <input type="text" id="todoInput" placeholder="Add a new task...">
            <button onclick="addTodo()">Add Task</button>
        </div>
        <ul id="todoList" class="todo-list"></ul>
    </div>
    <script src="script.js"></script>
</body>
</html>`
    },
    {
      type: 'create_file',
      fileName: 'styles.css',
      filePath: '/styles.css',
      content: `body {
    font-family: 'Segoe UI', Arial, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    margin: 0;
    padding: 0;
    min-height: 100vh;
}

.container {
    max-width: 600px;
    margin: 0 auto;
    padding: 2rem;
}

h1 {
    text-align: center;
    color: white;
    margin-bottom: 2rem;
    font-size: 2.5rem;
}

.todo-input {
    display: flex;
    gap: 1rem;
    margin-bottom: 2rem;
}

#todoInput {
    flex: 1;
    padding: 1rem;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    outline: none;
}

button {
    background: #28a745;
    color: white;
    border: none;
    padding: 1rem 1.5rem;
    border-radius: 8px;
    cursor: pointer;
    font-size: 1rem;
    transition: background 0.3s;
}

button:hover {
    background: #218838;
}

.delete-btn {
    background: #dc3545;
    padding: 0.5rem;
    margin-left: 1rem;
}

.delete-btn:hover {
    background: #c82333;
}

.todo-list {
    list-style: none;
    padding: 0;
}

.todo-item {
    background: white;
    margin: 0.5rem 0;
    padding: 1rem;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
}

.todo-item.completed {
    opacity: 0.6;
    text-decoration: line-through;
}

.todo-checkbox {
    margin-right: 1rem;
    transform: scale(1.2);
}`
    },
    {
      type: 'create_file',
      fileName: 'script.js',
      filePath: '/script.js',
      content: `let todos = [];
let todoId = 1;

function addTodo() {
    const input = document.getElementById('todoInput');
    const text = input.value.trim();
    
    if (text === '') {
        alert('Please enter a task!');
        return;
    }
    
    const todo = {
        id: todoId++,
        text: text,
        completed: false
    };
    
    todos.push(todo);
    input.value = '';
    renderTodos();
}

function deleteTodo(id) {
    todos = todos.filter(todo => todo.id !== id);
    renderTodos();
}

function toggleTodo(id) {
    const todo = todos.find(todo => todo.id === id);
    if (todo) {
        todo.completed = !todo.completed;
        renderTodos();
    }
}

function renderTodos() {
    const todoList = document.getElementById('todoList');
    todoList.innerHTML = '';
    
    todos.forEach(todo => {
        const li = document.createElement('li');
        li.className = \`todo-item \${todo.completed ? 'completed' : ''}\`;
        li.innerHTML = \`
            <div>
                <input type="checkbox" class="todo-checkbox" 
                       \${todo.completed ? 'checked' : ''} 
                       onchange="toggleTodo(\${todo.id})">
                <span>\${todo.text}</span>
            </div>
            <button class="delete-btn" onclick="deleteTodo(\${todo.id})">Delete</button>
        \`;
        todoList.appendChild(li);
    });
}

// Handle Enter key in input
document.getElementById('todoInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        addTodo();
    }
});

// Initialize with sample todos
todos = [
    { id: todoId++, text: 'Welcome to your Todo App!', completed: false },
    { id: todoId++, text: 'Click checkbox to mark complete', completed: false }
];
renderTodos();`
    }
  ];
}

async function generateCalculatorApp(): Promise<AIAction[]> {
  return [
    {
      type: 'create_file',
      fileName: 'index.html',
      filePath: '/index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Calculator</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div class="calculator">
        <div class="display">
            <input type="text" id="display" readonly>
        </div>
        <div class="buttons">
            <button onclick="clearDisplay()" class="clear">C</button>
            <button onclick="deleteLast()" class="delete">⌫</button>
            <button onclick="appendToDisplay('/')" class="operator">÷</button>
            <button onclick="appendToDisplay('*')" class="operator">×</button>
            
            <button onclick="appendToDisplay('7')">7</button>
            <button onclick="appendToDisplay('8')">8</button>
            <button onclick="appendToDisplay('9')">9</button>
            <button onclick="appendToDisplay('-')" class="operator">-</button>
            
            <button onclick="appendToDisplay('4')">4</button>
            <button onclick="appendToDisplay('5')">5</button>
            <button onclick="appendToDisplay('6')">6</button>
            <button onclick="appendToDisplay('+')" class="operator">+</button>
            
            <button onclick="appendToDisplay('1')">1</button>
            <button onclick="appendToDisplay('2')">2</button>
            <button onclick="appendToDisplay('3')">3</button>
            <button onclick="calculate()" class="equals" rowspan="2">=</button>
            
            <button onclick="appendToDisplay('0')" class="zero">0</button>
            <button onclick="appendToDisplay('.')">.</button>
        </div>
    </div>
    <script src="script.js"></script>
</body>
</html>`
    }
  ];
}

async function generateWeatherApp(): Promise<AIAction[]> {
  return [
    {
      type: 'create_file',
      fileName: 'index.html',
      filePath: '/index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Weather App</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div class="container">
        <h1>🌤️ Weather App</h1>
        <div class="search-box">
            <input type="text" id="cityInput" placeholder="Enter city name...">
            <button onclick="getWeather()">Get Weather</button>
        </div>
        <div id="weatherDisplay" class="weather-display hidden">
            <h2 id="cityName"></h2>
            <div class="weather-info">
                <div class="temperature" id="temperature"></div>
                <div class="description" id="description"></div>
                <div class="details">
                    <div class="detail">
                        <span>Feels like</span>
                        <span id="feelsLike"></span>
                    </div>
                    <div class="detail">
                        <span>Humidity</span>
                        <span id="humidity"></span>
                    </div>
                    <div class="detail">
                        <span>Wind</span>
                        <span id="windSpeed"></span>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <script src="script.js"></script>
</body>
</html>`
    }
  ];
}

function generateContextualResponse(message: string, files: any[]): string {
  const hasHTML = files.some(f => f.name.endsWith('.html'));
  const hasCSS = files.some(f => f.name.endsWith('.css'));
  const hasJS = files.some(f => f.name.endsWith('.js'));
  
  let response = `I understand you're asking about: "${message}"\n\n`;
  
  if (!hasHTML && !hasCSS && !hasJS) {
    response += `It looks like you're starting fresh! I can help you:
• Create HTML files with proper structure
• Add CSS for beautiful styling  
• Write JavaScript for interactivity
• Build complete applications like todo lists, calculators, or weather apps

Just ask me to create any of these!`;
  } else {
    response += `I can see your project has some files already. I can help you:
• Add new features to existing files
• Create additional components
• Fix any bugs or errors
• Improve the styling and design
• Add interactive functionality

What specific feature would you like to add or improve?`;
  }
  
  return response;
}

async function analyzeAndFixCode(files: any[], message: string): Promise<{ message: string, actions?: AIAction[] }> {
  // This is a simplified code analysis - in a real implementation, 
  // you'd use more sophisticated parsing and error detection
  
  const actions: AIAction[] = [];
  let suggestions = "I've analyzed your code and here are some suggestions:\n\n";
  
  // Check for common issues
  for (const file of files) {
    if (file.name.endsWith('.html') && file.content) {
      if (!file.content.includes('<!DOCTYPE html>')) {
        suggestions += "• Add DOCTYPE declaration to HTML files\n";
      }
      if (!file.content.includes('<meta name="viewport"')) {
        suggestions += "• Add viewport meta tag for mobile responsiveness\n";
      }
    }
    
    if (file.name.endsWith('.js') && file.content) {
      if (file.content.includes('var ')) {
        suggestions += "• Consider using 'let' or 'const' instead of 'var'\n";
      }
      if (!file.content.includes('addEventListener')) {
        suggestions += "• Use addEventListener for better event handling\n";
      }
    }
  }
  
  suggestions += "\nWould you like me to implement any of these improvements?";
  
  return { message: suggestions, actions };
}

async function improveProjectStyling(files: any[], message: string): Promise<{ message: string, actions: AIAction[] }> {
  const actions: AIAction[] = [];
  let responseMessage = "";
  
  const cssFile = files.find(f => f.name.endsWith('.css'));
  
  if (cssFile) {
    // Update existing CSS
    const improvedCSS = `/* Enhanced styles for better visual appeal */
${cssFile.content}

/* Additional modern improvements */
.fade-in {
    animation: fadeIn 0.5s ease-in;
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
}

.hover-effect:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    transition: all 0.3s ease;
}`;
    
    actions.push({
      type: 'update_file',
      fileId: cssFile.id,
      content: improvedCSS
    });
    
    responseMessage = "I've enhanced your CSS with modern animations and hover effects!";
  } else {
    // Create new CSS file
    actions.push({
      type: 'create_file',
      fileName: 'styles.css',
      filePath: '/styles.css',
      content: await generateCSSTemplate(message, files)
    });
    
    responseMessage = "I've created a new CSS file with modern styling for your project!";
  }
  
  return { message: responseMessage, actions };
}

async function generateReactComponent(message: string): Promise<string> {
  return `import React, { useState } from 'react';

const MyComponent = () => {
  const [count, setCount] = useState(0);

  return (
    <div className="component">
      <h2>My React Component</h2>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>
        Increment
      </button>
      <button onClick={() => setCount(count - 1)}>
        Decrement
      </button>
    </div>
  );
};

export default MyComponent;`;
}