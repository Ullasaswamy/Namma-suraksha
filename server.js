// server.js
const express = require('express');
const multer = require('multer');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

// --- Basic Setup ---
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads'); // Correct path using __dirname

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)){
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// --- View Engine Setup ---
app.set('views', path.join(__dirname, 'views')); // Set views directory
app.set('view engine', 'ejs');

// --- Multer Setup ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOADS_DIR);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- Middleware ---
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' })); // For form submissions & base64
app.use(bodyParser.json({ limit: '10mb'})); // For fetch API JSON bodies if needed
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from 'public' directory

// --- Routes ---
app.get('/', (req, res) => {
    res.redirect('/sos'); // Start at SOS page
});

app.get('/sos', (req, res) => {
    res.render('sos'); // Render views/sos.ejs
});

app.get('/chat', (req, res) => {
    res.render('chat'); // Render views/capture.ejs
});

app.get('/capture', (req, res) => {
    res.render('capture'); // Render views/chat.ejs
});

app.get('/Map', (req, res) => {
    res.render('Map'); // Render views/chat.ejs
});

// This route is no longer strictly necessary in the main flow but kept if needed
app.get('/chat-location', (req, res) => {
    res.render('chat-location'); // Render views/chat-location.ejs
});

// --- API Endpoints ---

// Handle photo uploads FROM THE CHAT PAGE (using fetch)
app.post('/upload', upload.single('snap'), (req, res) => {
    if (!req.file) {
        console.error('Upload failed: No file received.');
        return res.status(400).json({ message: 'No file uploaded.' });
    }
    const userName = req.body.name || 'User'; // Get name from FormData
    console.log(`Uploaded file from ${userName}:`, req.file);
    const imageUrl = `/uploads/${req.file.filename}`; // URL path relative to public folder

    // Emit the uploaded photo details to all clients
    io.emit('chat-message', {
        name: userName,
        type: 'image',
        message: `Uploaded a photo:`,
        imageUrl: imageUrl,
        dateTime: new Date(),
    });

    // Respond with success and image URL (for potential client-side confirmation)
    res.status(200).json({ message: 'Photo uploaded successfully!', imageUrl: imageUrl });
});

// Handle INITIAL photo capture from capture.ejs form submission
app.post('/captureSnap', (req, res) => {
    const imageData = req.body.image; // Base64 data URL from hidden input

    if (!imageData) {
        console.error('Capture failed: No image data received.');
        return res.status(400).send('No image data received.');
    }

    const base64Data = imageData.replace(/^data:image\/png;base64,/, '');
    const filename = `snap_${Date.now()}.png`;
    const filepath = path.join(UPLOADS_DIR, filename);
    const imageUrl = `/uploads/${filename}`;

    fs.writeFile(filepath, base64Data, 'base64', (err) => {
        if (err) {
            console.error('Error saving captured image:', err);
            return res.status(500).send('Failed to save image.');
        }
        console.log('Captured Image Saved:', filename);

        // Emit the captured image to all connected clients
        io.emit('chat-message', {
            name: '📷 System',
            type: 'image',
            message: 'Sent a snap:',
            imageUrl: imageUrl,
            dateTime: new Date()
        });

        // Respond success
        res.json({ success: true, redirectUrl: '/chat' });  // Tell client to move to /chat
    });
});


// --- Socket.io Chat Logic ---
let socketsConnected = new Set();

io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);
    socketsConnected.add(socket.id);
    io.emit('clients-total', socketsConnected.size); // Update total count for all

    socket.on('disconnect', () => {
        console.log('Socket disconnected:', socket.id);
        socketsConnected.delete(socket.id);
        io.emit('clients-total', socketsConnected.size); // Update total count for all
        // Optional: Emit 'user left' message if tracking names per socket
    });

    // Listen for regular text messages
    socket.on('message', (data) => {
        // Add type:'text' and broadcast
        socket.broadcast.emit('chat-message', { ...data, type: 'text' });
    });

     // Listen for location sharing
    socket.on('send-location', (data) => {
        console.log('Location received:', data);
         // Add type:'location' and broadcast
        socket.broadcast.emit('chat-message', {
             type: 'location',
             name: data.name,
             message: `Shared location.`, // Default text
             latitude: data.latitude,
             longitude: data.longitude,
             dateTime: new Date()
        });
    });

    // Listen for typing feedback
    socket.on('feedback', (data) => {
        socket.broadcast.emit('feedback', data); // Broadcast typing status
    });

     // Listen for image uploads/captures initiated *from the chat page* (if using socket emit)
     // Note: Current implementation uses fetch to /upload, which then emits via io.emit
     // If you wanted direct socket emission for images:
     /*
     socket.on('send-image', (data) => {
         // process base64 image data, save it, get URL
         // let imageUrl = saveImageAndGetUrl(data.imageData);
         socket.broadcast.emit('chat-message', {
             type: 'image',
             name: data.name,
             imageUrl: imageUrl,
             dateTime: new Date()
         });
     });
     */

});

// --- Start Server ---
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));