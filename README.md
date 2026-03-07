# Task Scheduler

A modern Kanban-style task management app built with React and TypeScript. Supports multi-board management, subtasks, task dependencies, browser notifications, drag-and-drop reordering, undo/redo history, and a fully responsive light/dark UI.

![Task Scheduler Screenshot](./src/assets/Screenshot-task-scheduler.png)

[DEMO](https://task-scheduler-rouge-gr925.vercel.app/)

## Features

**Task Management**
- Create, edit, and delete tasks with title, description, priority, due date, and tags
- Subtasks with individual checkboxes and a progress bar
- Task dependencies — block a task until its prerequisites are completed
- Batch operations: multi-select tasks to move or delete in bulk
- Undo / Redo support for all task mutations

**Boards**
- Multiple boards — create, rename, and delete boards independently
- Each board maintains its own task list and state

**Views & Filtering**
- Kanban columns: To-Do / In Progress / Done
- Drag and drop within and between columns
- Sort by priority or due date
- Filter by priority, deadline (Overdue / Today / This Week / Future), and tags
- Full-text search across task titles and descriptions

**Notifications & UX**
- Browser push notifications for overdue tasks and tasks due within 24 hours
- Statistics panel with completion rate and urgent task count
- Keyboard shortcuts: `N` new task, `/` focus search, `Ctrl+Z` undo, `Ctrl+Y` redo
- Quick-add input at the bottom of each column
- Light / Dark theme toggle

**Data**
- All data persisted in localStorage
- JSON export and import

## Installation

```bash
# Clone the repository
git clone https://github.com/Gorman/task-scheduler.git

# Navigate to the project directory
cd task-scheduler

# Install dependencies
npm install

# Start the development server
npm run dev
```

Open `http://localhost:5173` in your browser.

## Usage

| Action | How |
|--------|-----|
| New task | Click **新增任務** or press `N` |
| Search | Click the search bar or press `/` |
| Move task | Drag the card, or click **開始處理** / **標記完成** |
| Batch action | Click **批次操作**, select cards, then move or delete |
| Undo / Redo | `Ctrl+Z` / `Ctrl+Y`, or the toolbar buttons |
| Switch board | Click tabs below the header |
| Toggle theme | Click the sun/moon switch in the header |

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite
- **State Management**: Redux Toolkit
- **UI Components**: Ant Design 5
- **Drag and Drop**: @hello-pangea/dnd
- **Styling**: SCSS (Sass) with Inter font
- **Storage**: LocalStorage

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author

Created by Gorman (2025.03)
