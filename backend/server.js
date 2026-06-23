const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('./db');
const authenticateToken = require('./middleware/auth');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_for_schedule_notifier_123!';

app.use(cors());
app.use(express.json());

// Log incoming requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Public health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Auth Routes

// 1. Register User
app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Call Supabase Auth to register user (will trigger verification email if enabled)
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password
    });

    if (authError) {
      console.error('Supabase auth signUp error:', authError);
      return res.status(400).json({ error: authError.message });
    }

    const user = authData.user;
    if (!user) {
      return res.status(500).json({ error: 'Failed to create user session' });
    }

    // Keep public.users table synchronized.
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (!existingUser) {
      // Create a row in public.users table matching the auth user id
      const { error: dbInsertError } = await supabase
        .from('users')
        .insert([{ id: user.id, email, password_hash: 'SUPABASE_AUTH' }]);

      if (dbInsertError) {
        console.error('Database insertion error syncing user:', dbInsertError);
      }
    }

    res.status(201).json({
      message: 'Registration successful! Please check your email to verify your account before logging in.',
      user: {
        id: user.id,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Server error during registration:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// 2. Login User
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Authenticate using Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      console.error('Supabase auth signIn error:', authError);
      return res.status(400).json({ error: authError.message });
    }

    const user = authData.user;
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Ensure user exists in our local public.users sync table
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (!existingUser) {
      await supabase
        .from('users')
        .insert([{ id: user.id, email, password_hash: 'SUPABASE_AUTH' }]);
    }

    // Create JWT
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Server error during login:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Events Protected Routes

// 3. List User Events
app.get('/api/events', authenticateToken, async (req, res) => {
  try {
    const { data: events, error } = await supabase
      .from('events')
      .select('*')
      .eq('user_id', req.user.id)
      .order('date', { ascending: true })
      .order('time', { ascending: true });

    if (error) {
      console.error('Database error fetching events:', error);
      return res.status(500).json({ error: 'Failed to retrieve events' });
    }

    res.json(events || []);
  } catch (error) {
    console.error('Server error fetching events:', error);
    res.status(500).json({ error: 'Server error fetching events' });
  }
});

// 4. Create Event
app.post('/api/events', authenticateToken, async (req, res) => {
  const { title, date, time } = req.body;

  if (!title || !date || !time) {
    return res.status(400).json({ error: 'Title, date, and time are required' });
  }

  // Validate format basic check (date: YYYY-MM-DD, time: HH:MM)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const timeRegex = /^\d{2}:\d{2}$/;

  if (!dateRegex.test(date) || !timeRegex.test(time)) {
    return res.status(400).json({ error: 'Date must be YYYY-MM-DD and Time must be HH:MM' });
  }

  try {
    const { data: newEvents, error } = await supabase
      .from('events')
      .insert([
        {
          user_id: req.user.id,
          title,
          date,
          time,
          notified: false
        }
      ])
      .select();

    if (error) {
      console.error('Database error inserting event:', error);
      return res.status(500).json({ error: 'Failed to create event' });
    }

    res.status(201).json(newEvents[0]);
  } catch (error) {
    console.error('Server error creating event:', error);
    res.status(500).json({ error: 'Server error creating event' });
  }
});

// 5. Update Event
app.put('/api/events/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { title, date, time, notified } = req.body;

  if (!title || !date || !time) {
    return res.status(400).json({ error: 'Title, date, and time are required' });
  }

  try {
    const updateData = { title, date, time };
    if (typeof notified === 'boolean') {
      updateData.notified = notified;
    }

    const { data: updatedEvents, error } = await supabase
      .from('events')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select();

    if (error) {
      console.error('Database error updating event:', error);
      return res.status(500).json({ error: 'Failed to update event' });
    }

    if (!updatedEvents || updatedEvents.length === 0) {
      return res.status(404).json({ error: 'Event not found or unauthorized' });
    }

    res.json(updatedEvents[0]);
  } catch (error) {
    console.error('Server error updating event:', error);
    res.status(500).json({ error: 'Server error updating event' });
  }
});

// 6. Delete Event
app.delete('/api/events/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const { data: deletedEvents, error } = await supabase
      .from('events')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select();

    if (error) {
      console.error('Database error deleting event:', error);
      return res.status(500).json({ error: 'Failed to delete event' });
    }

    if (!deletedEvents || deletedEvents.length === 0) {
      return res.status(404).json({ error: 'Event not found or unauthorized' });
    }

    res.json({ message: 'Event deleted successfully', id });
  } catch (error) {
    console.error('Server error deleting event:', error);
    res.status(500).json({ error: 'Server error deleting event' });
  }
});

// 7. Polling endpoint for due events
app.get('/api/events/due', authenticateToken, async (req, res) => {
  const { date, time } = req.query;

  if (!date || !time) {
    return res.status(400).json({ error: 'date (YYYY-MM-DD) and time (HH:MM) query parameters are required' });
  }

  try {
    // Query events due for this user at this exact date and time that haven't been notified yet
    const { data: events, error } = await supabase
      .from('events')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('date', date)
      .lte('time', time)
      .eq('notified', false);

    if (error) {
      console.error('Database error querying due events:', error);
      return res.status(500).json({ error: 'Failed to query due events' });
    }

    if (events && events.length > 0) {
      const ids = events.map(e => e.id);
      
      // Mark these events as notified so they are not fetched on subsequent pollings
      const { error: updateError } = await supabase
        .from('events')
        .update({ notified: true })
        .in('id', ids);

      if (updateError) {
        console.error('Failed to mark events as notified:', updateError);
        // We still return the events to the client so they get notified
      }
    }

    res.json(events || []);
  } catch (error) {
    console.error('Server error querying due events:', error);
    res.status(500).json({ error: 'Server error querying due events' });
  }
});

// Todos Protected Routes

// 8. List User Todos for a Specific Date
app.get('/api/todos', authenticateToken, async (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ error: 'date (YYYY-MM-DD) query parameter is required' });
  }

  try {
    const { data: todos, error } = await supabase
      .from('todos')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('date', date)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Database error fetching todos:', error);
      return res.status(500).json({ error: 'Failed to retrieve todos' });
    }

    res.json(todos || []);
  } catch (error) {
    console.error('Server error fetching todos:', error);
    res.status(500).json({ error: 'Server error fetching todos' });
  }
});

// 9. Create Todo
app.post('/api/todos', authenticateToken, async (req, res) => {
  const { title, date } = req.body;

  if (!title || !date) {
    return res.status(400).json({ error: 'Title and date are required' });
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    return res.status(400).json({ error: 'Date must be in YYYY-MM-DD format' });
  }

  try {
    const { data: newTodo, error } = await supabase
      .from('todos')
      .insert([
        {
          user_id: req.user.id,
          title: title.trim(),
          date,
          completed: false
        }
      ])
      .select();

    if (error) {
      console.error('Database error inserting todo:', error);
      // Unique key violation check (Postgres code 23505)
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Task already exists for this date' });
      }
      return res.status(500).json({ error: 'Failed to create todo' });
    }

    res.status(201).json(newTodo[0]);
  } catch (error) {
    console.error('Server error creating todo:', error);
    res.status(500).json({ error: 'Server error creating todo' });
  }
});

// 10. Update Todo Completion Status
app.put('/api/todos/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { completed } = req.body;

  if (typeof completed !== 'boolean') {
    return res.status(400).json({ error: 'Completed status (boolean) is required' });
  }

  try {
    const { data: updatedTodo, error } = await supabase
      .from('todos')
      .update({ completed })
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select();

    if (error) {
      console.error('Database error updating todo:', error);
      return res.status(500).json({ error: 'Failed to update todo' });
    }

    if (!updatedTodo || updatedTodo.length === 0) {
      return res.status(404).json({ error: 'Todo not found or unauthorized' });
    }

    res.json(updatedTodo[0]);
  } catch (error) {
    console.error('Server error updating todo:', error);
    res.status(500).json({ error: 'Server error updating todo' });
  }
});

// 11. Delete Todo
app.delete('/api/todos/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const { data: deletedTodo, error } = await supabase
      .from('todos')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select();

    if (error) {
      console.error('Database error deleting todo:', error);
      return res.status(500).json({ error: 'Failed to delete todo' });
    }

    if (!deletedTodo || deletedTodo.length === 0) {
      return res.status(404).json({ error: 'Todo not found or unauthorized' });
    }

    res.json({ message: 'Todo deleted successfully', id });
  } catch (error) {
    console.error('Server error deleting todo:', error);
    res.status(500).json({ error: 'Server error deleting todo' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
