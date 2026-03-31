<?php

declare(strict_types=1);

namespace UpAssist\Neos\EditorNotifications\Controller\Api;

use Neos\Flow\Annotations as Flow;
use Neos\Flow\Mvc\Controller\ActionController;
use Neos\Flow\Mvc\View\JsonView;
use UpAssist\Neos\EditorNotifications\Domain\Model\Notification;
use UpAssist\Neos\EditorNotifications\Domain\Repository\NotificationRepository;
use UpAssist\Neos\EditorNotifications\Service\NotificationService;

class NotificationApiController extends ActionController
{
    protected $defaultViewObjectName = JsonView::class;

    /**
     * @var array<string, class-string>
     */
    protected $viewFormatToObjectNameMap = [
        'json' => JsonView::class,
    ];

    /**
     * @Flow\Inject
     * @var NotificationService
     */
    protected $notificationService;

    /**
     * @Flow\Inject
     * @var NotificationRepository
     */
    protected $notificationRepository;

    public function unreadCountAction(): void
    {
        $data = $this->notificationService->getActiveNotificationsForCurrentUser();
        $this->view->assign('value', ['count' => $data['count']]);
    }

    public function activeAction(): void
    {
        $data = $this->notificationService->getActiveNotificationsForCurrentUser();
        $this->view->assign('value', $data);
    }

    public function markSeenAction(string $notificationIdentifier): void
    {
        $notification = $this->notificationRepository->findByIdentifier($notificationIdentifier);
        if ($notification instanceof Notification) {
            $this->notificationService->markSeen($notification);
        }

        $this->view->assign('value', ['success' => $notification instanceof Notification]);
    }

    public function dismissAction(string $notificationIdentifier): void
    {
        $notification = $this->notificationRepository->findByIdentifier($notificationIdentifier);
        if ($notification instanceof Notification) {
            $this->notificationService->dismiss($notification);
        }

        $this->view->assign('value', ['success' => $notification instanceof Notification]);
    }
}
