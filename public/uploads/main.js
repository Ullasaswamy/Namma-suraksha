// public/main.js
const socket = io(); // Connect to the server

// --- DOM Elements ---
const clientsTotal = document.getElementById('client-total');
const messageContainer = document.getElementById('message-container');
const nameInput = document.getElementById('name-input');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const feedbackElement = document.getElementById('feedback');

// Buttons
const captureBtn = document.getElementById('captureBtn');
const uploadBtn = document.getElementById('uploadBtn');
const locationBtn = document.getElementById('locationBtn');

// Hidden Camera Elements
const cameraSection = document.getElementById('camera-section');
const video = document.getElementById('video');
const takePictureBtn = document.getElementById('takePictureBtn');
const cancelCaptureBtn = document.getElementById('cancelCaptureBtn');
const canvas = document.getElementById('canvas');
const imageInput = document.getElementById('imageInput'); // Hidden input for base64 data

// Hidden Upload Elements
const uploadForm = document.getElementById('uploadForm'); // The form itself
const uploadFile = document.getElementById('uploadFile'); // The file input

// Audio Notification
const messageTone = new Audio('/message-tone.mp3'); // Ensure this file exists in public/

// --- Event Listeners ---

messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage();
});

// --- Listeners for Chat Page Actions ---
captureBtn.addEventListener('click', startCapture); // Start capture FROM chat page
cancelCaptureBtn.addEventListener('click', cancelCapture);
takePictureBtn.addEventListener('click', takePictureAndSend); // Take pic & SEND FROM chat page

uploadBtn.addEventListener('click', () => {
    if (!checkName()) return;
    uploadFile.click(); // Trigger hidden file input
});

uploadFile.addEventListener('change', handleFileUpload); // Handle file selection

locationBtn.addEventListener('click', sendLocation);

// Typing Feedback Listeners
messageInput.addEventListener('focus', () => sendFeedback(true));
messageInput.addEventListener('keypress', () => sendFeedback(true));
messageInput.addEventListener('blur', () => sendFeedback(false));


// --- Socket Listeners ---

socket.on('connect', () => {
    console.log('Connected to server socket ID:', socket.id);
});

socket.on('clients-total', (data) => {
    clientsTotal.innerText = `Online: ${data}`;
});

socket.on('chat-message', (data) => {
    console.log('Message received:', data);
    // Play sound only for messages from others (check if data.name matches nameInput.value?)
    // Or simplify: play for all incoming for now.
    messageTone.play().catch(e => console.warn("Tone play failed:", e)); // Play sound
    addMessageToUI(false, data); // Add message from others
});

socket.on('feedback', (data) => {
    clearFeedback(); // Clear previous feedback
    if (data.isTyping && data.name && data.name !== nameInput.value) { // Show if typing and not self
         const element = `<p><i>✍️ ${data.name} is typing...</i></p>`;
         feedbackElement.innerHTML = element;
    }
});

// --- Helper Functions ---
function checkName() {
    if (nameInput.value.trim() === '') {
        alert('Please enter your name first!');
        nameInput.focus();
        return false;
    }
    return true;
}

// --- Core Functions ---

function sendMessage() {
    if (!checkName() || messageInput.value.trim() === '') {
        // Allow sending empty message? No, let's prevent.
        if (messageInput.value.trim() === '') messageInput.focus();
        return;
    }
    const data = {
        type: 'text', // Explicitly set type
        name: nameInput.value.trim(),
        message: messageInput.value.trim(),
        dateTime: new Date(),
    };
    socket.emit('message', data); // Send message object to server
    addMessageToUI(true, data); // Add own message to UI immediately
    messageInput.value = ''; // Clear input
    sendFeedback(false); // Clear typing feedback after sending
    messageInput.focus(); // Keep focus on input
}

function addMessageToUI(isOwnMessage, data) {
    clearFeedback(); // Clear typing feedback when a message arrives
    const li = document.createElement('li');
    // Basic check to prevent adding undefined messages
    if (!data || (!data.message && !data.imageUrl && !(data.latitude && data.longitude))) {
        console.warn("Attempted to add empty message data:", data);
        return;
    }

    // Determine if message is from self based on name (simple check)
    // Note: This is basic, relies on unique names. Better way is server assigning ID or client comparing socket ID.
    const actualIsOwnMessage = data.name === nameInput.value.trim();
    li.classList.add('message-item', actualIsOwnMessage ? 'message-right' : 'message-left');

    let content = '';
    // Use current time if dateTime is missing (shouldn't happen with server logic)
    const timeString = moment(data.dateTime || new Date()).fromNow();
    const senderSpan = `<span class="message-meta">${data.name} ● ${timeString}</span>`;

    const messageText = data.message ? data.message.replace(/</g, "&lt;").replace(/>/g, "&gt;") : ''; // Basic XSS prevention

    switch (data.type) {
        case 'image':
            content = `
                <p class="message image-message">
                    ${messageText} <br>
                    <img src="${data.imageUrl}" alt="User image" style="max-width: 200px; border-radius: 8px; margin-top: 5px; cursor: pointer;" onclick="window.open('${data.imageUrl}', '_blank')" />
                    ${senderSpan}
                </p>`;
            break;
        case 'location':
            const mapsLink = `http://www.openstreetmap.org/?mlat=${data.latitude}&mlon=${data.longitude}#map=16/${data.latitude}/${data.longitude}`;
            // const mapsLink = `https://www.google.com/maps?q=${data.latitude},${data.longitude}`; // Alternative Google Maps
            content = `
                <p class="message location-message">
                    ${messageText || `${data.name} shared location.`} <br>
                    <a href="${mapsLink}" target="_blank" title="View on Map">📍 View Location</a>
                    ${senderSpan}
                </p>`;
            break;
        case 'text':
        default:
            content = `
                <p class="message text-message">
                    ${messageText}
                    ${senderSpan}
                </p>`;
            break;
    }

    li.innerHTML = content;
    messageContainer.appendChild(li);
    scrollToBottom();
}

function scrollToBottom() {
    messageContainer.scrollTop = messageContainer.scrollHeight;
}

function sendFeedback(isTyping) {
    if (!nameInput.value) return; // Don't send feedback without a name
    socket.emit('feedback', {
        isTyping: isTyping,
        name: nameInput.value.trim(),
    });
}

function clearFeedback() {
    feedbackElement.innerHTML = '';
}

// --- Camera Functions (Chat Page) ---
let stream = null; // To hold the camera stream

function startCapture() {
     if (!checkName()) return;
    cameraSection.style.display = 'block';
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        .then((mediaStream) => {
            stream = mediaStream; // Store the stream
            video.srcObject = stream;
            video.play(); // Explicitly play
        })
        .catch((err) => {
            console.error("Error accessing camera: ", err);
            alert("Could not access camera. Please check permissions.");
            cancelCapture(); // Hide section if error
        });
}

function cancelCapture() {
    cameraSection.style.display = 'none';
    if (stream) {
        stream.getTracks().forEach(track => track.stop()); // Stop camera tracks
        stream = null;
        video.srcObject = null;
    }
}

// This function sends the captured image data using fetch FROM THE CHAT PAGE
function takePictureAndSend() {
    if (!checkName()) return;

    const context = canvas.getContext('2d');
     if (video.readyState < video.HAVE_METADATA) {
         alert("Camera not ready yet.");
         return;
     }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = canvas.toDataURL('image/png'); // Get base64 data URL

    // --- Send using Fetch API to /captureSnap ---
    // We are reusing /captureSnap endpoint, but now expecting it to handle fetch requests too
    // Alternatively, create a new endpoint like /captureFromChat
    const formData = new URLSearchParams(); // Use URLSearchParams for easy form encoding
    formData.append('image', imageData);
    formData.append('name', nameInput.value.trim()); // Send name

    fetch('/captureSnap', { // REUSE endpoint, server needs slight adjustment if needed
         method: 'POST',
         headers: {
             'Content-Type': 'application/x-www-form-urlencoded', // Important header
         },
         body: formData // Send URL-encoded data
     })
     .then(response => {
         if (!response.ok) {
             throw new Error(`HTTP error! status: ${response.status}`);
         }
         return response.json(); // Assuming server responds with JSON now
     })
     .then(data => {
         console.log('Capture successful (from chat):', data);
          // Add message to UI immediately? NO - rely on socket emission from server for consistency
          // addMessageToUI(true, { type: 'image', name: nameInput.value, imageUrl: data.imageUrl, dateTime: new Date() });
          cancelCapture(); // Hide camera section after successful capture
     })
     .catch(error => {
         console.error('Capture submission error (from chat):', error);
         alert('Failed to send snap.');
         cancelCapture(); // Hide camera even on error
     });
}


// --- Upload Function (Chat Page) ---
function handleFileUpload() {
    if (!checkName()) {
        uploadForm.reset(); // Clear selection if name is missing
        return;
    }
    if (uploadFile.files.length === 0) return; // No file selected

    const file = uploadFile.files[0];
    const formData = new FormData(); // Use FormData for file uploads
    formData.append('snap', file); // 'snap' must match multer fieldname on server
    formData.append('name', nameInput.value.trim()); // Send name

    // Send using Fetch API to /upload
    fetch('/upload', {
        method: 'POST',
        body: formData, // FormData handles multipart/form-data encoding
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Upload failed! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('Upload successful:', data);
        // Don't add to UI here, wait for socket emission from server
    })
    .catch(error => {
        console.error('Upload error:', error);
        alert('Upload failed.');
    })
    .finally(() => {
        uploadForm.reset(); // Clear the file input after attempt
    });
}


// --- Location Function (Chat Page) ---

function sendLocation() {
    if (!checkName()) return;

    if ('geolocation' in navigator) {
        locationBtn.disabled = true; // Prevent multiple clicks
        locationBtn.textContent = '📍...'; // Indicate loading

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                console.log(`Location found: ${latitude}, ${longitude}`);
                const locationData = {
                    type: 'location', // Ensure type is set
                    name: nameInput.value.trim(),
                    latitude: latitude,
                    longitude: longitude,
                    dateTime: new Date(),
                };
                socket.emit('send-location', locationData); // Send location data to server
                addMessageToUI(true, locationData); // Add own location message to UI immediately
                locationBtn.disabled = false;
                 locationBtn.textContent = '📍';
            },
            (error) => {
                console.error("Error getting location:", error);
                alert(`Could not get location: ${error.message}`);
                 locationBtn.disabled = false;
                 locationBtn.textContent = '📍';
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 } // Options
        );
    } else {
        alert("Geolocation is not supported by your browser.");
    }
}

// --- Initial Setup ---
// scrollToBottom(); // Scroll down on load (might be better after first message)
nameInput.focus(); // Focus name input initially

// Optional: Add a welcome message or load history if implemented
// addMessageToUI(false, { name: 'System', message: 'Welcome to iChat!', dateTime: new Date(), type: 'text' });