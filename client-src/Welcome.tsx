import React from 'react';
import ReactDOM from 'react-dom';
import 'regenerator-runtime/runtime';
import { BrowserRouter as Router, Switch, Route } from 'react-router-dom';
import Intro from './Intro';
import Signin from './Signin';
import Signup from './Signup';

const Welcome = () => (
  <Router>
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
  </Router>
);

ReactDOM.render(
  <Welcome />,
  document.querySelector('.app'),
);
