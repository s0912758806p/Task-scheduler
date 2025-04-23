# Task Scheduler

A modern web-based task scheduling application that helps you manage daily tasks, set deadlines, and improve productivity. Supports both light and dark themes with rich task management features.

![Task Scheduler Screenshot](screenshot.png)

## Features

- Create, edit, and delete tasks
- Set task priorities (Urgent, High, Medium, Low) and deadlines
- Drag and drop functionality: easily move tasks between different status columns (To-Do, In Progress, Completed)
- Versatile task filtering options:
  - Filter by priority
  - Filter by deadline (Overdue, Today, This Week, Future)
  - Text search functionality
- Light/Dark theme toggle with system preference auto-switching
- Import/Export task data
- Responsive design for desktop and mobile devices

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

## Usage

After starting the development server, open your browser and navigate to `http://localhost:3000`.

- Click the "Add Task" button in the top-right corner to create a new task
- Use the search box and filter options to find specific tasks
- Use buttons on task cards to quickly change task status
- Alternatively, drag and drop task cards between status columns
- Click the theme toggle button in the top-right corner to switch between light and dark themes

## Tech Stack

- **Frontend Framework**: React + TypeScript
- **State Management**: Redux Toolkit
- **UI Component Library**: Ant Design
- **Drag and Drop**: @hello-pangea/dnd
- **Styling**: SCSS (Sass)
- **Data Storage**: LocalStorage for client-side data persistence

## Project Status

The project currently has all basic functionality implemented and is being continuously improved.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author

Created by Gorman (2025.04)
