import React, { useState } from 'react';

const TeacherDashboard = () => {
    const [roomName, setRoomName] = useState('');
    
    const createRoom = () => {
        // Logic to create a room
        console.log(`Room Created: ${roomName}`);
        // Add your room creation logic here
        // Clear the input field after creating the room
        setRoomName('');
    };

    const startGame = () => {
        // Logic to start the game
        console.log('Game Started');
        // Add your game start logic here
    };

    return (
        <div>
            <h1>Teacher Dashboard</h1>
            <div>
                <input 
                    type="text" 
                    value={roomName} 
                    onChange={(e) => setRoomName(e.target.value)} 
                    placeholder="Enter Room Name" 
                />
                <button onClick={createRoom}>Create Room</button>
            </div>
            <button onClick={startGame}>Start Game</button>
        </div>
    );
};

export default TeacherDashboard;