import React from 'react';
import ReactDOM from 'react-dom';
import 'regenerator-runtime/runtime';
import {
  BrowserRouter as Router, Switch, Route,
} from 'react-router-dom';
import '@mortvola/forms/dist/main.css';
import Intro from './Intro';
import Signin from './Signin';
import Signup from './Signup';
import usePageViews from './Tracker';
import './welcome.css';

const Welcome = () => {
  usePageViews();

  return (
    <Switch>
      <Route path="/signup">
        <Signup />
      </Route>
      <Route path="/signin">
        <Signin />
      </Route>
      <Route path="/">
        <Intro />
      </Route>
    </Switch>
  );
};

ReactDOM.render(
  <Router>
    <Welcome />
  </Router>,
  document.querySelector('.app'),
);
