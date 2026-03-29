import React from 'react';
import { Link } from 'react-router-dom';

const Home: React.FC = () => {
    return (
        <div style={{ textAlign: 'center', padding: '50px' }}>
            <h1>Welcome to Econospy</h1>
            <h2>Please select your role to continue:</h2>
            <div style={{ margin: '20px' }}>
                <Link to="/student-login" style={{ marginRight: '30px' }}>
                    <button style={{ padding: '10px 20px', fontSize: '16px' }}>Student Login</button>
                </Link>
                <Link to="/teacher-login">
                    <button style={{ padding: '10px 20px', fontSize: '16px' }}>Teacher Login</button>
                </Link>
            </div>
        </div>
    );
};

export default Home;