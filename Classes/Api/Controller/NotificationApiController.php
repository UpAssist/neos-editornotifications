<?php

declare(strict_types=1);

namespace UpAssist\Neos\EditorNotifications\Api\Controller;

use Neos\Flow\Annotations as Flow;
use Neos\Flow\Mvc\Controller\ActionController;
use Neos\Flow\Mvc\View\JsonView;
use Neos\Flow\ResourceManagement\ResourceManager;
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

    /**
     * @Flow\Inject
     * @var ResourceManager
     */
    protected $resourceManager;

    public function unreadCountAction(): void
    {
        $data = $this->notificationService->getActiveNotificationsForCurrentUser();
        $this->view->assign('value', ['count' => $data['count']]);
    }

    public function activeAction(bool $includeDismissed = false): void
    {
        $data = $this->notificationService->getActiveNotificationsForCurrentUser($includeDismissed);
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

    public function markUnseenAction(string $notificationIdentifier): void
    {
        $notification = $this->notificationRepository->findByIdentifier($notificationIdentifier);
        if ($notification instanceof Notification) {
            $this->notificationService->markUnseen($notification);
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

    public function uploadImageAction(): void
    {
        if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            $this->view->assign('value', ['success' => false, 'error' => 'No file uploaded']);
            return;
        }

        $mediaType = $_FILES['file']['type'] ?? '';
        if (!str_starts_with($mediaType, 'image/')) {
            $this->view->assign('value', ['success' => false, 'error' => 'Only images are allowed']);
            return;
        }

        if ($_FILES['file']['size'] > 10 * 1024 * 1024) {
            $this->view->assign('value', ['success' => false, 'error' => 'File too large (max 10 MB)']);
            return;
        }

        $content = file_get_contents($_FILES['file']['tmp_name']);
        if ($content === false) {
            $this->view->assign('value', ['success' => false, 'error' => 'Failed to read uploaded file']);
            return;
        }

        $resource = $this->resourceManager->importResourceFromContent(
            $content,
            $_FILES['file']['name']
        );

        $uri = $this->resourceManager->getPublicPersistentResourceUri($resource);
        $this->view->assign('value', ['success' => true, 'url' => (string)$uri]);
    }
}
