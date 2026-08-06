import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import './style.css';

import TwinView from './views/TwinView.vue';
import Stage1View from './views/Stage1View.vue';
import Stage2View from './views/Stage2View.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'twin', component: TwinView },
    { path: '/stage1', name: 'stage1', component: Stage1View },
    { path: '/stage2', name: 'stage2', component: Stage2View },
  ],
});

createApp(App).use(router).mount('#app');
