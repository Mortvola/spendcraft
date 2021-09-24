import React from 'react';
import ReactDOM from 'react-dom';
import 'regenerator-runtime/runtime';
import styles from './Welcome.module.css';

const Welcome = () => {
  const className = 'flex-center position-ref full-height';

  return (
    <div style={{ maxWidth: '1400px', justifySelf: 'center' }}>
      <div
        className={className}
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1fr)',
          gridTemplateRows: 'max-content minmax(0,1fr)',
          width: '100%',
          height: '100%',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'max-content max-content',
            gridTemplateRows: 'max-content',
            columnGap: '2rem',
            marginTop: '1rem',
            justifyContent: 'center',
          }}
        >
          <a href="/register" className={styles.linkButton} style={{ fontSize: '1.25rem' }}>Sign up</a>
          <a href="/login" className={styles.linkButton} style={{ fontSize: '1.25rem' }}>Sign in</a>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,2fr)',
            gridTemplateRows: 'minmax(0,1fr)',
            width: '100%',
            height: '100%',
            alignItems: 'start',
            justifyItems: 'center',
          }}
        >
          <div
            style={{
              marginLeft: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'start',
            }}
          >
            <div
              style={{
                fontSize: '4.5rem',
                fontFamily: 'Georgiate, sans-serif',
                color: '#8e2727',
              }}
            >
              SpendCraft
            </div>
            <div style={{ fontSize: '2rem' }}>We all spend money.</div>
            <div style={{ fontSize: '2rem' }}>Be smart about how you spend it.</div>
            <div style={{ marginTop: '1rem', marginBottom: '2rem' }}>
              With an easy to use envelope style budgeting system,
              take control of your expenditures and spend your money
              on the things that are important to you.
            </div>
            <a
              href="/register"
              className={styles.linkButton}
              style={{
                fontSize: '2rem',
                padding: '0.5rem 1rem',
                backgroundColor: '#308730',
                color: 'white',
              }}
            >
              Sign up for free
            </a>
          </div>
          <img src="/budgeting.svg" alt="" style={{ maxWidth: '90%', maxHeight: '90%', alignSelf: 'center' }} />
        </div>
      </div>
    </div>
  );
};

ReactDOM.render(
  <Welcome />,
  document.querySelector('.app'),
);
