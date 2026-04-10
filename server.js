const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());

// Your data storage
let globalServers = [
    {
        id: "s1",
        name: "Rete HQ",
        icon: "R",
        owner: "system",
        inviteCode: "RETE2025",
        channels: [
            { id: "c1", name: "general" },
            { id: "c2", name: "announcements" }
        ],
        members: []
    },
    {
        id: "s2",
        name: "AI Builders",
        icon: "AI",
        owner: "system",
        inviteCode: "AIMESH",
        channels: [
            { id: "c3", name: "llm-talk" },
            { id: "c4", name: "showcase" }
        ],
        members: []
    },
    {
        id: "s3",
        name: "SaaS Founders",
        icon: "S",
        owner: "system",
        inviteCode: "SAAS2025",
        channels: [
            { id: "c5", name: "growth" },
            { id: "c6", name: "metrics" }
        ],
        members: []
    }
];

let messages = {
    "c1": [
        { id: "m1", author: "ReteAI", content: "Welcome to Rete! Messages sync across ALL devices worldwide! 🌍", timestamp: Date.now(), reactions: {} }
    ],
    "c3": [
        { id: "m2", author: "DeepSeek", content: "Discuss local LLMs and AI agents here.", timestamp: Date.now(), reactions: {} }
    ],
    "c5": [
        { id: "m3", author: "ReteAI", content: "Share your MRR milestones and growth tactics.", timestamp: Date.now(), reactions: {} }
    ]
};

let users = {};

// Socket connection handling
io.on('connection', (socket) => {
    console.log('🌍 New user connected:', socket.id);
    let currentUser = null;
    
    // Register user
    socket.on('register', (username, callback) => {
        currentUser = username;
        if (!users[username]) {
            users[username] = {
                servers: ["s1", "s2", "s3"],
                friends: [],
                status: "online",
                avatar: "👤"
            };
        }
        callback({
            success: true,
            servers: globalServers,
            userServers: users[username].servers,
            messages: messages
        });
        socket.join(`user_${username}`);
        console.log(`✅ ${username} registered`);
    });
    
    // Join server
    socket.on('join_server', (serverId) => {
        socket.join(`server_${serverId}`);
        let server = globalServers.find(s => s.id === serverId);
        if (server && !server.members.includes(currentUser)) {
            server.members.push(currentUser);
        }
        io.to(`server_${serverId}`).emit('members_update', server?.members);
        console.log(`📡 ${currentUser} joined server ${serverId}`);
    });
    
    // Join channel
    socket.on('join_channel', (channelId) => {
        socket.join(`channel_${channelId}`);
        socket.emit('load_messages', messages[channelId] || []);
        console.log(`💬 ${currentUser} joined channel ${channelId}`);
    });
    
    // Send message
    socket.on('send_message', (data) => {
        if (!messages[data.channelId]) messages[data.channelId] = [];
        const newMsg = {
            id: Date.now().toString(),
            author: data.author,
            content: data.content,
            timestamp: Date.now(),
            reactions: {}
        };
        messages[data.channelId].push(newMsg);
        io.to(`channel_${data.channelId}`).emit('new_message', newMsg);
        console.log(`💬 ${data.author}: ${data.content.substring(0, 50)}`);
    });
    
    // Typing indicator
    socket.on('typing', (data) => {
        socket.to(`channel_${data.channelId}`).emit('user_typing', {
            user: data.user,
            isTyping: data.isTyping
        });
    });
    
    // Add reaction
    socket.on('add_reaction', (data) => {
        let msg = messages[data.channelId]?.find(m => m.id === data.messageId);
        if (msg) {
            if (!msg.reactions[data.emoji]) msg.reactions[data.emoji] = [];
            if (!msg.reactions[data.emoji].includes(data.user)) {
                msg.reactions[data.emoji].push(data.user);
            } else {
                msg.reactions[data.emoji] = msg.reactions[data.emoji].filter(u => u !== data.user);
            }
            io.to(`channel_${data.channelId}`).emit('reaction_update', {
                messageId: data.messageId,
                reactions: msg.reactions
            });
        }
    });
    
    // Delete message
    socket.on('delete_message', (data) => {
        let idx = messages[data.channelId]?.findIndex(m => m.id === data.messageId);
        if (idx !== -1 && messages[data.channelId][idx].author === data.user) {
            messages[data.channelId].splice(idx, 1);
            io.to(`channel_${data.channelId}`).emit('message_deleted', data.messageId);
            console.log(`🗑️ ${data.user} deleted a message`);
        }
    });
    
    // Create server
    socket.on('create_server', (data, callback) => {
        const newId = "s" + Date.now();
        const newServer = {
            id: newId,
            name: data.name,
            icon: data.name.charAt(0),
            owner: data.owner,
            inviteCode: (data.name + Math.random().toString(36).substr(2, 6)).toUpperCase(),
            channels: [{ id: "c" + Date.now(), name: "general" }],
            members: [data.owner]
        };
        globalServers.push(newServer);
        users[data.owner].servers.push(newId);
        callback({ success: true, server: newServer });
        io.emit('server_created', newServer);
        console.log(`✨ ${data.owner} created server: ${data.name}`);
    });
    
    // Join server by invite code
    socket.on('join_server_by_code', (inviteCode, callback) => {
        let server = globalServers.find(s => s.inviteCode === inviteCode.toUpperCase());
        if (server && !users[currentUser].servers.includes(server.id)) {
            users[currentUser].servers.push(server.id);
            server.members.push(currentUser);
            callback({ success: true, server: server });
            io.to(`server_${server.id}`).emit('members_update', server.members);
            console.log(`🎉 ${currentUser} joined server: ${server.name}`);
        } else {
            callback({ success: false });
        }
    });
    
    // Disconnect
    socket.on('disconnect', () => {
        console.log('❌ User disconnected:', socket.id);
    });
});

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ status: 'online', message: 'Rete backend is running!' });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`
    ╔═══════════════════════════════════════╗
    ║     🚀 RETE BACKEND IS RUNNING!       ║
    ╠═══════════════════════════════════════╣
    ║  Port: ${PORT}                           ║
    ║  Status: Online                       ║
    ║  Ready for Netlify connection         ║
    ╚═══════════════════════════════════════╝
    `);
});