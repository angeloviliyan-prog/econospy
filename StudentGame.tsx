import React from 'react';

interface GameProps {
  question: string;
  options: string[];
  onSelect: (answer: string) => void;
}

const StudentGame: React.FC<GameProps> = ({ question, options, onSelect }) => {
  return (
    <div>
      <h2>{question}</h2>
      <ul>
        {options.map((option, index) => (
          <li key={index} onClick={() => onSelect(option)}>{option}</li>
        ))}
      </ul>
    </div>
  );
};

export default StudentGame;
