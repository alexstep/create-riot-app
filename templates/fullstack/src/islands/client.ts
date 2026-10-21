import define from '@riotjs/custom-elements';
import '../styles/landing.css';
import { applyStoredTheme, watchSystemTheme } from '../cabinet/theme';
import LoginForm from './login-form.riot';
import LoginLink from './login-link.riot';
import SubscribeForm from './subscribe-form.riot';
import ThemeToggle from './theme-toggle.riot';

applyStoredTheme();
watchSystemTheme();

define('x-theme-toggle', ThemeToggle);
define('x-login-link', LoginLink);
define('x-subscribe-form', SubscribeForm);
define('x-login-form', LoginForm);
